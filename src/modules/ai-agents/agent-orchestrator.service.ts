import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createLogger } from '../../common/services/logger.service';
import { recordChipSentTimestamp } from '../cadence/cadence-guard.helper';
import { MessageService } from '../message/message.service';
import { AiFeedbackLoopService } from '../ai-agent/ai-feedback-loop.service';
import { LeadResponderInboundService } from './lead-responder-inbound.service';
import { LeadQualificationAgent } from './lead-qualification.agent';
import { MessageGenerationAgent } from './message-generation.agent';
import { recordAgentDecision } from './agents-metrics';
import { SafetyGuardrailsAgent } from './safety-guardrails.agent';
import {
  dropProposal,
  flushProposalsSync,
  loadProposalsFromDisk,
  pendingProposals,
  persistProposal,
} from './proposal-persistence';
import {
  AgentDecision,
  AgentDecisionBreakdown,
  AgentLeadInput,
  DispatchProposal,
  GeneratedMessage,
  QualificationResult,
  SafetyCheckResult,
} from './agents.types';

/**
 * Agent Orchestrator — the pipeline maestro.
 *
 * FASE 1 (semi-autônomo, AGENTS.md): the pipeline DECIDES and PROPOSES; it never sends on its
 * own. A dispatch happens only through approveProposal() — one proposal per human confirmation,
 * never a batch. The consensus vote is weighted (qualification 35%, message 25%, safety 30%,
 * timing 10%) with two absolute rules on top: safety has veto (a safety reject is always the
 * final decision), and a sub-threshold consensus downgrades to 'hold' (human review) instead of
 * risking a bad dispatch.
 *
 * Proposals live in memory only (bounded ring): they are suggestions, not records — the durable
 * trail is the guard snapshot, the agent decision counters and the message store after approval.
 */

/** Consensus confidence below this downgrades 'dispatch' to 'hold'. */
export const CONSENSUS_THRESHOLD = 0.7;

const WEIGHTS = { qualification: 0.35, message: 0.25, safety: 0.3, timing: 0.1 } as const;

const MAX_PROPOSALS = 500;

@Injectable()
export class AgentOrchestratorService implements OnModuleInit {
  private readonly logger = createLogger('AgentOrchestratorService');
  private readonly proposals = new Map<string, DispatchProposal>();
  private proposalSeq = 0;
  private messageService?: MessageService;

  constructor(
    private readonly qualificationAgent: LeadQualificationAgent,
    private readonly messageAgent: MessageGenerationAgent,
    private readonly safetyAgent: SafetyGuardrailsAgent,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /**
   * Restores the pending queue from the durable snapshot. After a restart, proposals that were
   * already awaiting (or needing) a human decision come back instead of falling into the
   * CRM-marker hole (lead marked 'proposed' in Supabase, proposal gone). Spent/rejected proposals
   * are never restored — their trail is the message store / decision counters.
   */
  onModuleInit(): void {
    loadProposalsFromDisk();
    for (const proposal of pendingProposals()) {
      if (!this.proposals.has(proposal.id)) this.proposals.set(proposal.id, proposal);
    }
    // Keep the sequence above every restored id (`prop-<base36 time>-<n>`), so new ids cannot collide.
    for (const id of this.proposals.keys()) {
      const seq = Number(id.split('-').pop());
      if (Number.isFinite(seq) && seq > this.proposalSeq) this.proposalSeq = seq;
    }
  }

  /** Force-write the pending queue (useful before shutdown; normally the debounced flush runs). */
  flushProposals(): void {
    flushProposalsSync();
  }

  private getMessageService(): MessageService | undefined {
    if (!this.messageService && this.moduleRef) {
      this.messageService = this.moduleRef.get(MessageService, { strict: false });
    }
    return this.messageService;
  }

  private getFeedbackLoop(): AiFeedbackLoopService | undefined {
    if (!this.feedbackLoop && this.moduleRef) {
      try {
        this.feedbackLoop = this.moduleRef.get(AiFeedbackLoopService, { strict: false });
      } catch {
        return undefined;
      }
    }
    return this.feedbackLoop;
  }
  private feedbackLoop?: AiFeedbackLoopService;

  /**
   * Runs the full pipeline for one lead: qualify -> safety -> generate -> consensus. Always
   * terminates in a proposal (or a rejected one with the reason). Never sends anything.
   */
  async proposeDispatch(
    lead: AgentLeadInput,
    options: { activeSessionIds?: string[]; nowTimestampMs?: number } = {},
  ): Promise<DispatchProposal> {
    const qualification = await this.qualificationAgent.qualify(lead);
    recordAgentDecision('qualification', this.voteFromQualification(qualification), qualification.source);

    const safety = this.safetyAgent.check(lead, {
      activeSessionIds: options.activeSessionIds,
      nowTimestampMs: options.nowTimestampMs,
    });

    // Short-circuit: safety veto (opt-out, protected phone, no chip) or REJECT qualification.
    if (!safety.allowed) {
      const proposal = this.buildProposal(
        lead,
        qualification,
        null,
        safety,
        this.finalize('reject', [
          {
            agent: 'qualification',
            weight: WEIGHTS.qualification,
            vote: this.voteFromQualification(qualification),
            confidence: qualification.confidence,
          },
          { agent: 'message', weight: WEIGHTS.message, vote: 'hold', confidence: 0 },
          { agent: 'safety', weight: WEIGHTS.safety, vote: 'reject', confidence: 1 },
          { agent: 'timing', weight: WEIGHTS.timing, vote: 'hold', confidence: 0 },
        ]),
        `safety: ${safety.violations.join(', ')}`,
      );
      return this.store(proposal);
    }
    if (qualification.recommendation === 'REJECT') {
      const proposal = this.buildProposal(
        lead,
        qualification,
        null,
        safety,
        this.finalize('reject', [
          {
            agent: 'qualification',
            weight: WEIGHTS.qualification,
            vote: 'reject',
            confidence: qualification.confidence,
          },
          { agent: 'message', weight: WEIGHTS.message, vote: 'hold', confidence: 0 },
          { agent: 'safety', weight: WEIGHTS.safety, vote: 'dispatch', confidence: 1 },
          { agent: 'timing', weight: WEIGHTS.timing, vote: 'hold', confidence: 0 },
        ]),
        'qualification: REJECT',
      );
      return this.store(proposal);
    }

    const message = await this.messageAgent.generate(lead, qualification);
    recordAgentDecision('message', message.source === 'llm' ? 'dispatch' : 'hold', message.source);

    const breakdown = this.consensus(qualification, message, safety, lead);
    const proposal = this.buildProposal(lead, qualification, message, safety, breakdown);
    return this.store(proposal);
  }

  /**
   * Approves ONE proposal and dispatches it (FASE 1: the human gate). Re-runs the safety check at
   * approval time — the world changed since the proposal (interval, quota, opt-out) — and fails
   * closed on any violation. Records the chip timestamp so the durable 360s interval applies.
   */
  async approveProposal(
    proposalId: string,
    options: { activeSessionIds?: string[]; nowTimestampMs?: number } = {},
  ): Promise<{ dispatched: boolean; reason?: string; proposal?: DispatchProposal }> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return { dispatched: false, reason: 'proposta não encontrada ou expirada' };
    if (proposal.decision.decision !== 'dispatch') {
      return { dispatched: false, reason: `proposta não está apta (decisão: ${proposal.decision.decision})` };
    }

    const now = options.nowTimestampMs ?? Date.now();
    const safety = this.safetyAgent.check(proposal.lead, {
      activeSessionIds: options.activeSessionIds,
      nowTimestampMs: now,
    });
    if (!safety.allowed || !safety.sessionId) {
      proposal.decision.decision = 'reject';
      dropProposal(proposal.id); // terminal state: remove from the durable pending set
      return {
        dispatched: false,
        reason: `safety reprovou na hora do envio: ${safety.violations.join(', ')}`,
        proposal,
      };
    }

    const messageService = this.getMessageService();
    if (!messageService) {
      return { dispatched: false, reason: 'MessageService indisponível neste deployment', proposal };
    }

    try {
      await messageService.sendText(safety.sessionId, {
        chatId: proposal.lead.phone,
        text: proposal.message.text,
      });
      recordChipSentTimestamp(safety.sessionId, now);
      this.safetyAgent.recordDispatch(safety.sessionId, now);
      // The conversation now belongs to the responder agent: Sofia stays silent for this chat and
      // the inbound bridge will react to the lead's replies. Best-effort state flip.
      LeadResponderInboundService.markAgentHandled(
        proposal.lead.phone.includes('@') ? proposal.lead.phone : `${proposal.lead.phone}@c.us`,
      );
      // Feed the learning loop: this engagement (style included) is what recordLeadReply will
      // attach the lead's answer to, teaching the message agent which openings get replies.
      void this.getFeedbackLoop()
        ?.trackSentMessage(
          proposal.lead.phone,
          proposal.lead.phone,
          safety.sessionId,
          `agents-${proposal.lead.niche}`, // personaId carries the NICHE: ouro vs agro learn separately
          proposal.message.text,
        )
        .catch(err =>
          this.logger.warn(`Engagement tracking failed: ${err instanceof Error ? err.message : String(err)}`),
        );
      proposal.decision.decision = 'hold'; // spent: prevents double approval
      persistProposal(proposal); // decision changed: refresh the durable snapshot
      this.logger.log(
        `[Agent Dispatch Aprovado] ${proposal.lead.phone} via ${safety.chipName} (proposta ${proposal.id})`,
      );
      return { dispatched: true, proposal };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Approved dispatch failed for ${proposal.lead.phone}: ${msg}`);
      return { dispatched: false, reason: `falha no envio: ${msg}`, proposal };
    }
  }

  /** Pending proposals, newest first (for the human approval queue). */
  listProposals(filter?: 'dispatch' | 'hold' | 'reject'): DispatchProposal[] {
    return [...this.proposals.values()]
      .filter(p => (filter ? p.decision.decision === filter : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getProposal(id: string): DispatchProposal | undefined {
    return this.proposals.get(id);
  }

  /**
   * Weighted consensus voting. Safety holds veto power by construction: its reject saturates the
   * 'reject' tally beyond any other combination. A dispatch below the confidence threshold
   * downgrades to 'hold' (human decides).
   */
  private consensus(
    qualification: QualificationResult,
    message: GeneratedMessage,
    safety: SafetyCheckResult,
    lead: AgentLeadInput,
  ): AgentDecisionBreakdown {
    const contributions: AgentDecisionBreakdown['contributions'] = [
      {
        agent: 'qualification',
        weight: WEIGHTS.qualification,
        vote: this.voteFromQualification(qualification),
        confidence: qualification.confidence,
      },
      {
        agent: 'message',
        weight: WEIGHTS.message,
        vote: message.source === 'llm' ? 'dispatch' : 'hold',
        confidence: message.confidence,
      },
      { agent: 'safety', weight: WEIGHTS.safety, vote: safety.allowed ? 'dispatch' : 'reject', confidence: 1 },
      {
        agent: 'timing',
        weight: WEIGHTS.timing,
        vote: (lead.previousTouches?.length ?? 0) >= 3 ? 'hold' : 'dispatch',
        confidence: 0.6,
      },
    ];

    const breakdown = this.finalize(this.tally(contributions), contributions);
    return breakdown;
  }

  private voteFromQualification(qualification: QualificationResult): AgentDecision {
    return qualification.recommendation === 'CONTACT'
      ? 'dispatch'
      : qualification.recommendation === 'HOLD'
        ? 'hold'
        : 'reject';
  }

  private tally(contributions: AgentDecisionBreakdown['contributions']): AgentDecision {
    const tally: Record<AgentDecision, number> = { dispatch: 0, hold: 0, reject: 0 };
    let confidenceMass = 0;
    for (const { weight, vote, confidence } of contributions) {
      tally[vote] += weight * Math.max(confidence, 0.5);
      confidenceMass += weight;
    }
    const winner = (Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] ?? 'hold') as AgentDecision;
    const confidence = winner === 'dispatch' ? tally.dispatch / confidenceMass : 1;
    if (winner === 'dispatch' && confidence < CONSENSUS_THRESHOLD) {
      recordAgentDecision('consensus', 'hold', 'rules');
      return 'hold';
    }
    recordAgentDecision('consensus', winner, 'rules');
    return winner;
  }

  private finalize(decision: AgentDecision, contributions: AgentDecisionBreakdown['contributions']) {
    const dispatchScore = contributions
      .filter(c => c.vote === 'dispatch')
      .reduce((sum, c) => sum + c.weight * Math.max(c.confidence, 0.5), 0);
    const confidence = decision === 'dispatch' ? dispatchScore : Math.max(...contributions.map(c => c.confidence));
    return { decision, confidence: Math.min(1, Math.round(confidence * 100) / 100), contributions };
  }

  private buildProposal(
    lead: AgentLeadInput,
    qualification: QualificationResult,
    message: GeneratedMessage | null,
    safety: SafetyCheckResult,
    decision: AgentDecisionBreakdown,
    blockedReason?: string,
  ): DispatchProposal {
    return {
      id: this.nextId(),
      createdAt: new Date().toISOString(),
      lead,
      qualification,
      message: message ?? { text: '', personalization: 'basic', confidence: 0, source: 'template' },
      safety,
      decision,
      sessionId: safety.sessionId,
      blockedReason,
    };
  }

  private nextId(): string {
    this.proposalSeq += 1;
    return `prop-${Date.now().toString(36)}-${this.proposalSeq}`;
  }

  private store(proposal: DispatchProposal): DispatchProposal {
    this.proposals.set(proposal.id, proposal);
    // Bounded ring: drop the oldest entries beyond the cap.
    if (this.proposals.size > MAX_PROPOSALS) {
      const oldest = [...this.proposals.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) {
        this.proposals.delete(oldest.id);
        dropProposal(oldest.id);
      }
    }
    persistProposal(proposal);
    return proposal;
  }
}
