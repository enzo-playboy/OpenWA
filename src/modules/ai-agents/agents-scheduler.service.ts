import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createLogger } from '../../common/services/logger.service';
import { SupabaseSyncService, SupabaseLead } from '../cadence/supabase-sync.service';
import { AgentsAlertsService } from './agents-alerts.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentLeadInput, DispatchProposal } from './agents.types';
import { LeadNiche } from './agents.types';

/**
 * Agent Scheduler — the leg that feeds the pipeline.
 *
 * Periodically pulls leads from the Supabase CRM and runs them through the orchestrator, so
 * proposals accumulate in the approval queue without anyone calling POST /ai-agents/propose by
 * hand. The human gate is untouched: the scheduler PROPOSES, a person approves one by one.
 *
 * Controls:
 *   AGENT_SCHEDULER_ENABLED=true      turn the loop on (default OFF — same FASE 1 posture)
 *   AGENT_SCHEDULER_INTERVAL_MS       tick interval (default 5 min)
 *   AGENT_SCHEDULER_BATCH_SIZE        max leads per tick (default 10)
 *   AGENT_SCHEDULER_STATUS            Supabase status filter (default 'cold')
 *
 * Dedupe: a lead already proposed in this process is skipped (phone set), so ticks can overlap or
 * repeat without re-proposing the same person. The daily chip quota and every other guard still
 * apply inside the orchestrator — the scheduler adds no dispatching of its own.
 *
 * Niche routing: metadata.nicho (ouro|agro) when present, else AGENT_SCHEDULER_DEFAULT_NICHE,
 * else 'agro'. The lead's CRM status is updated to 'proposed' after a successful proposal so the
 * next tick does not re-fetch it even across restarts (durable dedupe).
 */

export const AGENT_SCHEDULER_ENABLED_ENV = 'AGENT_SCHEDULER_ENABLED';

/** Marker written to the CRM row so a restart does not re-propose the same lead. */
export const PROPOSED_STATUS_MARKER = 'proposed';

@Injectable()
export class AgentsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('AgentsSchedulerService');
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  /** In-process dedupe set (phones proposed since boot; the CRM marker covers restarts). */
  private readonly proposedPhones = new Set<string>();
  private supabaseSync?: SupabaseSyncService;

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly alerts: AgentsAlertsService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  private getSupabase(): SupabaseSyncService | undefined {
    if (!this.supabaseSync && this.moduleRef) {
      try {
        this.supabaseSync = this.moduleRef.get(SupabaseSyncService, { strict: false });
      } catch {
        return undefined;
      }
    }
    return this.supabaseSync;
  }

  static get enabled(): boolean {
    return process.env[AGENT_SCHEDULER_ENABLED_ENV] === 'true';
  }

  private get intervalMs(): number {
    const parsed = Number(process.env.AGENT_SCHEDULER_INTERVAL_MS);
    return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : 5 * 60_000;
  }

  private get batchSize(): number {
    const parsed = Number(process.env.AGENT_SCHEDULER_BATCH_SIZE);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;
  }

  private get statusFilter(): string {
    return process.env.AGENT_SCHEDULER_STATUS || 'cold';
  }

  onModuleInit(): void {
    if (!AgentsSchedulerService.enabled) {
      this.logger.log('Agent Scheduler disabled (AGENT_SCHEDULER_ENABLED!=true).');
      return;
    }
    this.logger.log(`Agent Scheduler enabled: tick ${this.intervalMs}ms, batch ${this.batchSize}.`);
    this.intervalId = setInterval(() => {
      this.tick().catch(err =>
        this.logger.error(`Scheduler tick failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  /** One scheduler pass. Public for manual triggering and tests. */
  async tick(): Promise<{ processed: number; proposed: number; skipped: number }> {
    if (this.isProcessing) return { processed: 0, proposed: 0, skipped: 0 };
    this.isProcessing = true;
    try {
      const supabase = this.getSupabase();
      if (!supabase?.isConfigured()) {
        return { processed: 0, proposed: 0, skipped: 0 };
      }

      const leads = await supabase.fetchLeadsFromSupabase(this.batchSize * 3, this.statusFilter);
      const pending = leads.filter(l => !this.proposedPhones.has(this.normalizePhone(l.phone)));
      const batch = pending.slice(0, this.batchSize);

      let proposed = 0;
      let skipped = 0;
      for (const lead of batch) {
        const phone = this.normalizePhone(lead.phone);
        try {
          const proposal = await this.orchestrator.proposeDispatch(this.toAgentLead(lead));
          this.proposedPhones.add(phone);
          if (proposal.decision.decision === 'dispatch') {
            proposed++;
            void supabase.updateLeadStatusInSupabase(this.normalizePhone(lead.phone), {
              status: PROPOSED_STATUS_MARKER,
            });
          } else {
            // HOLD/REJECT proposals stay in their CRM status; the operator sees them in the queue.
            skipped++;
          }
        } catch (err: unknown) {
          skipped++;
          this.logger.warn(`Pipeline failed for ${lead.phone}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (batch.length > 0) {
        this.logger.log(`[Scheduler] batch=${batch.length} proposed=${proposed} skipped=${skipped}`);
      }
      return { processed: batch.length, proposed, skipped };
    } finally {
      this.isProcessing = false;
    }
  }

  /** Pending dispatch-ready proposals count, for alerts/tests. */
  dispatchQueueSize(): number {
    return this.orchestrator.listProposals('dispatch').length;
  }

  private toAgentLead(lead: SupabaseLead): AgentLeadInput {
    const niche = this.normalizeNiche(lead);
    return {
      phone: this.normalizePhone(lead.phone),
      name: lead.name,
      company: typeof lead.metadata?.company === 'string' ? lead.metadata.company : undefined,
      niche,
      notes: this.buildNotes(lead),
      previousTouches: this.buildPreviousTouches(lead),
    };
  }

  /**
   * Rebuilds the touch history from the CRM row so the timing agent's >=3 touches rule and the
   * message agent know this is a FOLLOW-UP, not a cold first contact. Sources, latest last:
   *   - current_step: the cadence engine persists the last sent step order there (1..10);
   *     synthesized labels keep the array populated when the templates themselves are absent.
   *   - metadata.previous_touches: explicit per-touch texts when the operator/cadence records them.
   */
  private buildPreviousTouches(lead: SupabaseLead): string[] {
    const touches: string[] = [];

    const explicit = lead.metadata?.previous_touches;
    if (Array.isArray(explicit)) {
      for (const t of explicit.slice(-10)) {
        if (typeof t === 'string' && t.trim()) touches.push(t.trim());
      }
    }

    if (touches.length === 0 && typeof lead.current_step === 'number' && lead.current_step > 0) {
      for (let step = 1; step <= Math.min(lead.current_step, 10); step++) {
        touches.push(`Toque ${step} enviado pela régua de cadência`);
      }
    }

    return touches;
  }

  /**
   * Merges CRM notes with the lead's own last reply (when stored) so qualification and message
   * generation see how the lead left the conversation — a busy reply reads very differently from
   * an interested one.
   */
  private buildNotes(lead: SupabaseLead): string | undefined {
    const crmNotes = typeof lead.metadata?.notes === 'string' ? lead.metadata.notes.trim() : '';
    const lastReply = typeof lead.last_reply_text === 'string' ? lead.last_reply_text.trim() : '';
    if (crmNotes && lastReply) return `${crmNotes}\nÚltima resposta do lead: "${lastReply}"`;
    return crmNotes || lastReply || undefined;
  }

  private normalizeNiche(lead: SupabaseLead): LeadNiche {
    const raw = String(lead.metadata?.nicho ?? lead.metadata?.niche ?? '').toLowerCase();
    if (raw.includes('ouro') || raw.includes('joia') || raw.includes('joalher') || raw.includes('semijoia')) {
      return 'ouro';
    }
    if (raw) return 'agro';
    return (process.env.AGENT_SCHEDULER_DEFAULT_NICHE as LeadNiche) || 'agro';
  }

  private normalizePhone(phone: string): string {
    return (phone || '').replace(/\D/g, '');
  }
}
