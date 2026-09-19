import { Injectable, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../common/services/logger.service';
import {
  acquireChipLock,
  isProtectedContact,
  releaseChipLock,
  resolveChipForNiche,
  validateChipInterval,
  validateChipRateLimit,
} from '../cadence/cadence-guard.helper';
import { restrictionBlocksDispatch, restrictionResumeAt } from '../cadence/restriction-resume';
import { AgentsAlertsService } from './agents-alerts.service';
import { recordAgentDecision } from './agents-metrics';
import { AgentLeadInput, SafetyCheckResult } from './agents.types';

/**
 * Safety Guardrails Agent.
 *
 * Encapsulates every hard rule a dispatch must pass before a human even sees a proposal. Reuses
 * the durable cadence guards (360s interval, rate limit, protected contacts) rather than
 * duplicating them, and adds the two rules the cadence path lacks: a per-chip daily quota and an
 * opt-out registry (LGPD art. 18, IV — a lead asking to stop wins over any pipeline decision).
 *
 * This agent NEVER contacts the LLM and NEVER sends anything: it only decides whether a dispatch
 * WOULD be allowed. The daily quota is an in-process backstop — the true throttle for everything
 * on a chip remains the durable 360s interval, which this agent shares with the cadence engine.
 */

import type { AccountRestriction } from '../../engine/interfaces/whatsapp-engine.interface';

/** Per-chip daily dispatch quota recorded through this agent. */
export const DAILY_QUOTA_PER_CHIP = 40;

/**
 * Opt-out registry (revocation of consent, LGPD). A small JSON file, gitignored via data/,
 * overridable with AGENT_OPT_OUT_PATH for tests. Writes are synchronous: opt-out changes are
 * rare, and durability of a "do not contact" list is not negotiable.
 */
export class OptOutRegistry {
  private static phones = new Map<string, { reason: string; at: string }>();
  private static loadedFromFile = false;

  static file(): string {
    return process.env.AGENT_OPT_OUT_PATH || path.resolve(process.cwd(), 'data', 'agent-opt-outs.json');
  }

  static normalize(phone: string): string {
    return (phone || '').replace(/\D/g, '');
  }

  private static ensureLoaded(): void {
    if (this.loadedFromFile) return;
    this.loadedFromFile = true;
    try {
      const file = this.file();
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
          phones?: Record<string, { reason: string; at: string }>;
        };
        for (const [phone, entry] of Object.entries(parsed?.phones ?? {})) {
          this.phones.set(phone, entry);
        }
      }
    } catch {
      // A corrupt registry must never crash the pipeline; starts empty and is overwritten on
      // the next add(). An operator editing the file by hand is the recovery path.
    }
  }

  private static save(): void {
    try {
      const file = this.file();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const payload = {
        version: 1,
        phones: Object.fromEntries(this.phones.entries()),
      };
      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // Best-effort: the in-memory map still blocks dispatches this process.
    }
  }

  static isOptedOut(phone: string): boolean {
    this.ensureLoaded();
    return this.phones.has(this.normalize(phone));
  }

  static add(phone: string, reason = 'solicitação do titular'): void {
    this.ensureLoaded();
    this.phones.set(this.normalize(phone), { reason, at: new Date().toISOString() });
    this.save();
  }

  static remove(phone: string): boolean {
    this.ensureLoaded();
    const removed = this.phones.delete(this.normalize(phone));
    if (removed) this.save();
    return removed;
  }

  /** Test hook: forget everything, including the loaded flag. */
  static resetForTests(): void {
    this.phones.clear();
    this.loadedFromFile = false;
  }
}

/** Read-only restriction lookup the guardrails agent depends on (keeps the session module out). */
export interface SessionRestrictionReader {
  get(sessionId: string): AccountRestriction | undefined;
}

@Injectable()
export class SafetyGuardrailsAgent {
  private readonly logger = createLogger('SafetyGuardrailsAgent');

  /** sessionId -> { dayKey, count } for the per-process daily quota backstop. */
  private readonly dailyDispatches = new Map<string, { dayKey: string; count: number }>();

  constructor(@Optional() private readonly alerts?: AgentsAlertsService) {}

  /** Injected restriction reader (SessionRestrictionStore); optional for standalone tests. */
  private restrictionReader?: SessionRestrictionReader;

  /** Wire the live restriction store (called by the module/provider wiring). */
  setRestrictionReader(reader: SessionRestrictionReader): void {
    this.restrictionReader = reader;
  }

  /**
   * Runs every hard rule in cheap-to-expensive order and resolves the chip for the niche.
   * Synchronous on purpose: no I/O on the hot path (guards are in-memory + debounced snapshot).
   */
  check(
    lead: AgentLeadInput,
    options: { nowTimestampMs?: number; activeSessionIds?: string[] } = {},
  ): SafetyCheckResult {
    const now = options.nowTimestampMs ?? Date.now();
    const violations: string[] = [];
    const reasons: string[] = [];

    // 1. LGPD opt-out wins over everything.
    if (OptOutRegistry.isOptedOut(lead.phone)) {
      recordAgentDecision('safety', 'reject', 'rules');
      return {
        allowed: false,
        violations: ['opt_out'],
        reasons: ['Lead solicitou exclusão de contato (LGPD art. 18, IV)'],
      };
    }

    // 2. Manual-attendance protected phones (AGENTS.md rule 4).
    if (isProtectedContact(lead.phone)) {
      recordAgentDecision('safety', 'reject', 'rules');
      return {
        allowed: false,
        violations: ['protected_contact'],
        reasons: ['Número sob atendimento manual do usuário'],
      };
    }

    // 3. Chip routing by niche, with availability (failover already resolved inside).
    const chip = resolveChipForNiche(lead.niche, options.activeSessionIds);
    if (!chip.isAvailable) {
      recordAgentDecision('safety', 'reject', 'rules');
      return {
        allowed: false,
        violations: ['chip_unavailable'],
        reasons: [`Nenhum chip disponível para o nicho ${lead.niche}`],
      };
    }

    // 3b. Account restriction (reachout_timelock — the 24h suspension): a timelocked chip is out
    // of the dispatch rotation even though the session itself stays READY.
    const restriction = this.restrictionReader?.get(chip.sessionId);
    if (restrictionBlocksDispatch(restriction)) {
      const resumeAt = restrictionResumeAt(restriction);
      recordAgentDecision('safety', 'reject', 'rules');
      this.alerts?.alert(
        'chip_restriction',
        `Chip suspenso por 24h: ${chip.chipName}`,
        { chip: chip.sessionId, ate: resumeAt ? new Date(resumeAt).toISOString() : 'desconhecido' },
        chip.sessionId,
      );
      return {
        allowed: false,
        violations: ['account_restriction'],
        reasons: [
          `Chip sob reachout_timelock até ${resumeAt ? new Date(resumeAt).toISOString() : 'desconhecido'} — prospecção pausada neste chip`,
        ],
        sessionId: chip.sessionId,
        chipName: chip.chipName,
      };
    }

    // 4. Durable 360s chip interval (shared with the cadence engine).
    const interval = validateChipInterval(chip.sessionId, 360, now);
    if (!interval.valid) {
      violations.push('chip_interval');
      reasons.push(`Intervalo mínimo de 6 min entre envios não respeitado (restam ${interval.remainingSeconds}s)`);
    }

    // 5. Rate limit per chip (backstop; unreachable at the 360s pace).
    const rate = validateChipRateLimit(chip.sessionId, 20, now);
    if (!rate.allowed) {
      violations.push('rate_limit');
      reasons.push('Limite de 20 mensagens/min no chip excedido');
    }

    // 6. Per-chip daily quota (in-process backstop).
    const usedToday = this.quotaUsedToday(chip.sessionId, now);
    if (usedToday >= DAILY_QUOTA_PER_CHIP) {
      violations.push('daily_quota');
      reasons.push(`Quota diária de ${DAILY_QUOTA_PER_CHIP} envios por chip atingida (${usedToday} hoje)`);
    }

    if (violations.length > 0) {
      recordAgentDecision('safety', 'reject', 'rules');
      return { allowed: false, violations, reasons, sessionId: chip.sessionId, chipName: chip.chipName };
    }

    recordAgentDecision('safety', 'dispatch', 'rules');
    return { allowed: true, violations: [], reasons: [], sessionId: chip.sessionId, chipName: chip.chipName };
  }

  /** Record one completed dispatch against the daily quota (called after a successful send). */
  recordDispatch(sessionId: string, nowTimestampMs: number = Date.now()): void {
    const dayKey = new Date(nowTimestampMs).toISOString().slice(0, 10);
    const entry = this.dailyDispatches.get(sessionId);
    if (entry && entry.dayKey === dayKey) {
      entry.count += 1;
    } else {
      this.dailyDispatches.set(sessionId, { dayKey, count: 1 });
    }
  }

  /** Current quota usage for the given chip/day (test-visible). */
  quotaUsedToday(sessionId: string, nowTimestampMs: number = Date.now()): number {
    const dayKey = new Date(nowTimestampMs).toISOString().slice(0, 10);
    const entry = this.dailyDispatches.get(sessionId);
    return entry && entry.dayKey === dayKey ? entry.count : 0;
  }

  /**
   * Serializes a critical section per chip using the durable guard lock: acquires, runs, always
   * releases. Returns null when another worker holds the lock.
   */
  async withChipLock<T>(sessionId: string, ttlMs: number, body: () => Promise<T>): Promise<T | null> {
    const lockId = acquireChipLock(sessionId, ttlMs);
    if (!lockId) return null;
    try {
      return await body();
    } finally {
      releaseChipLock(sessionId, lockId);
    }
  }
}
