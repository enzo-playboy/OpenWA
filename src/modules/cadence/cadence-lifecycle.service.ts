import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadCadenceProgress, CadenceLeadStatus } from './entities/lead-cadence-progress.entity';
import { CadenceEngineService } from './cadence-engine.service';
import { createLogger } from '../../common/services/logger.service';

export interface EventEmitterLike {
  emit(event: string, ...args: any[]): boolean;
}

export type RepliedPausedOutcome = 'qualified' | 'nurture' | 'manual_handoff' | 'timeout_reengage';

export interface CadenceLifecycleConfig {
  reengageTimeoutHours: number;
  nurtureSequenceId: string;
  minConfidenceForQualified: number;
  maxReengageCycles: number;
}

export interface OutcomeContext {
  summary: string;
  aiConfidence?: number;
  agentNotes?: string;
  reengageContext?: string;
}

export interface TransitionLogRecord {
  leadId: string;
  phone: string;
  previousStatus: CadenceLeadStatus;
  newStatus: CadenceLeadStatus;
  outcome: RepliedPausedOutcome;
  reason: string;
  timestamp: Date;
}

@Injectable()
export class CadenceLifecycleService {
  private readonly logger = createLogger('CadenceLifecycleService');
  private readonly transitionLogs: TransitionLogRecord[] = [];

  private config: CadenceLifecycleConfig = {
    reengageTimeoutHours: 24,
    nurtureSequenceId: 'nurture-sequence',
    minConfidenceForQualified: 0.7,
    maxReengageCycles: 2,
  };

  constructor(
    @InjectRepository(LeadCadenceProgress, 'data')
    private readonly leadProgressRepo: Repository<LeadCadenceProgress>,
    private readonly cadenceEngine: CadenceEngineService,
    @Optional() private readonly eventEmitter?: EventEmitterLike,
  ) {}

  getConfig(): CadenceLifecycleConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<CadenceLifecycleConfig>): CadenceLifecycleConfig {
    this.config = { ...this.config, ...partial };
    return this.getConfig();
  }

  getTransitionLogs(leadPhoneOrId?: string): TransitionLogRecord[] {
    if (leadPhoneOrId) {
      return this.transitionLogs.filter(l => l.leadId === leadPhoneOrId || l.phone === leadPhoneOrId);
    }
    return [...this.transitionLogs];
  }

  /**
   * Called when AI finishes conversation or timeout job triggers.
   * Resolves the replied_paused state into one of 4 active outcomes.
   */
  async resolveRepliedPaused(
    leadPhoneOrId: string,
    outcome: RepliedPausedOutcome,
    context: OutcomeContext,
  ): Promise<LeadCadenceProgress | null> {
    const lead = await this.leadProgressRepo.findOne({
      where: [{ id: leadPhoneOrId }, { phone: leadPhoneOrId }],
    });

    if (!lead) {
      this.logger.warn(`Lead ${leadPhoneOrId} not found for lifecycle transition.`);
      return null;
    }

    // Race Condition / Optimistic Lock Guard: Only transition leads in 'replied_paused' or active re-eval
    if (lead.status !== 'replied_paused' && lead.status !== 'active') {
      this.logger.warn(
        `[Race Condition Guard] Aborting lifecycle transition for lead ${lead.phone}: status is '${lead.status}', expected 'replied_paused'.`,
      );
      return null;
    }

    const previousStatus = lead.status;
    let targetOutcome = outcome;
    let reason = context.summary;

    // Loop Protection Guard: maxReengageCycles
    if (targetOutcome === 'timeout_reengage') {
      const currentCycles = lead.reengageCycles || 0;
      if (currentCycles >= this.config.maxReengageCycles) {
        this.logger.warn(
          `[Loop Protection] Lead ${lead.phone} reached max re-engage cycles (${currentCycles}/${this.config.maxReengageCycles}). Redirecting to nurture cadence.`,
        );
        targetOutcome = 'nurture';
        reason = `Max reengage cycles reached (${currentCycles}/${this.config.maxReengageCycles}). Redirected to nurture cadence. Original reason: ${context.summary}`;
      }
    }

    switch (targetOutcome) {
      case 'qualified': {
        lead.status = 'qualified';
        lead.nextRunAt = null;
        lead.lastOutcomeReason = reason;
        await this.leadProgressRepo.save(lead);

        this.logger.log(`[Lifecycle Qualified] Lead ${lead.phone} marked as QUALIFIED.`);
        break;
      }

      case 'nurture': {
        lead.status = 'nurture_cadence';
        lead.lastOutcomeReason = reason;
        await this.leadProgressRepo.save(lead);

        await this.cadenceEngine.switchCadence(lead.id, this.config.nurtureSequenceId);
        this.logger.log(
          `[Lifecycle Nurture] Lead ${lead.phone} moved to nurture cadence '${this.config.nurtureSequenceId}'.`,
        );
        break;
      }

      case 'manual_handoff': {
        lead.status = 'manual_handoff';
        lead.nextRunAt = null;
        lead.lastOutcomeReason = reason;
        await this.leadProgressRepo.save(lead);

        const priority = (context.aiConfidence ?? 0) >= this.config.minConfidenceForQualified ? 'high' : 'normal';

        if (this.eventEmitter) {
          this.eventEmitter.emit('handoff.requested', {
            leadId: lead.id,
            phone: lead.phone,
            summary: reason,
            priority,
            agentNotes: context.agentNotes,
            timestamp: new Date(),
          });
        }

        this.logger.log(`[Lifecycle Handoff] Lead ${lead.phone} escalated to manual handoff (Priority: ${priority}).`);
        break;
      }

      case 'timeout_reengage': {
        lead.reengageCycles = (lead.reengageCycles || 0) + 1;
        lead.status = 'reengaged';
        lead.lastOutcomeReason = reason;
        await this.leadProgressRepo.save(lead);

        const contextualMsg =
          context.reengageContext ||
          'Vi que a gente não conseguiu conversar mais cedo — sem problemas! Aproveitando que estou por aqui:';

        await this.cadenceEngine.resumeFromLastStep(lead.id, contextualMsg);
        this.logger.log(
          `[Lifecycle Timeout Re-engage] Lead ${lead.phone} re-engaged (Cycle ${lead.reengageCycles}/${this.config.maxReengageCycles}).`,
        );
        break;
      }
    }

    // Record transition log for auditability & analytics
    const logRecord: TransitionLogRecord = {
      leadId: lead.id,
      phone: lead.phone,
      previousStatus,
      newStatus: lead.status,
      outcome: targetOutcome,
      reason,
      timestamp: new Date(),
    };
    this.transitionLogs.push(logRecord);

    return lead;
  }
}
