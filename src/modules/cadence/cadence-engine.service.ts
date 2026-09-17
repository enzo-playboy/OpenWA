import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cadence } from './entities/cadence.entity';
import { CadenceStep } from './entities/cadence-step.entity';
import { LeadCadenceProgress } from './entities/lead-cadence-progress.entity';
import { MessageService } from '../message/message.service';
import { createLogger } from '../../common/services/logger.service';
import { SupabaseSyncService } from './supabase-sync.service';
import {
  isProtectedContact,
  resolveChipForNiche,
  validateChipInterval,
  recordChipSentTimestamp,
} from './cadence-guard.helper';

function parseSpintax(text: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g;
  return text.replace(spintaxRegex, (_match: string, choices: string) => {
    const options = choices.split('|');
    return options[Math.floor(Math.random() * options.length)].trim();
  });
}

function renderTemplate(template: string, lead: LeadCadenceProgress): string {
  let rendered = parseSpintax(template);

  // Replace default variables
  const vars: Record<string, string> = {
    nome: lead.leadName ?? '',
    phone: lead.phone.split('@')[0],
    ...(lead.variables || {}),
  };

  for (const [key, val] of Object.entries(vars)) {
    const reg = new RegExp(`\\{${key}\\}`, 'gi');
    rendered = rendered.replace(reg, String(val));
  }

  return rendered;
}

@Injectable()
export class CadenceEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('CadenceEngineService');
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private messageService?: MessageService;

  constructor(
    @InjectRepository(Cadence, 'data')
    private readonly cadenceRepository: Repository<Cadence>,
    @InjectRepository(CadenceStep, 'data')
    private readonly cadenceStepRepository: Repository<CadenceStep>,
    @InjectRepository(LeadCadenceProgress, 'data')
    private readonly leadProgressRepository: Repository<LeadCadenceProgress>,
    private readonly supabaseSync: SupabaseSyncService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  private getMessageService(): MessageService | undefined {
    if (!this.messageService && this.moduleRef) {
      this.messageService = this.moduleRef.get(MessageService, { strict: false });
    }
    return this.messageService;
  }

  onModuleInit() {
    this.logger.log('Starting Cadence Engine (10-Touch Follow-up Processor)...');
    // Run ticker every 15 seconds
    this.intervalId = setInterval(() => {
      this.processDueCadenceSteps().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        this.logger.error(`Error in Cadence Engine tick: ${msg}`, stack);
      });
    }, 15000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Listen to inbound WhatsApp messages.
   * If StopOnReply is enabled and the lead responds, pause follow-up immediately.
   */
  async handleInboundMessage(sessionId: string, message: Record<string, any>) {
    if (!message || message.fromMe) return;

    const fromJid = String(message.from || message.chatId || '');
    if (!fromJid) return;

    const rawPhone = fromJid.split('@')[0];
    const cleanPhone = `${rawPhone}@c.us`;

    const activeLeads = await this.leadProgressRepository.find({
      where: [
        { sessionId, phone: cleanPhone, status: 'active' },
        { sessionId, phone: fromJid, status: 'active' },
      ],
      relations: { cadence: true },
    });

    for (const lead of activeLeads) {
      if (lead.cadence && lead.cadence.stopOnReply) {
        lead.status = 'replied_paused';
        lead.lastReplyAt = new Date();
        await this.leadProgressRepository.save(lead);

        // Sync to Supabase
        void this.supabaseSync.updateLeadStatusInSupabase(lead.phone, {
          status: 'replied_paused',
          last_reply_at: new Date().toISOString(),
          last_reply_text: String(message.body || ''),
        });

        this.logger.log(`[StopOnReply] Lead ${lead.phone} replied! Paused 10-touch cadence ${lead.cadenceId}`);
      }
    }
  }

  private isWithinWorkingHours(cadence: Cadence): boolean {
    if (!cadence.workingHoursOnly) return true;
    const now = new Date();
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay();

    // Weekend check (0 = Sunday, 6 = Saturday)
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;

    return currentHour >= cadence.startHour && currentHour < cadence.endHour;
  }

  async processDueCadenceSteps() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      const dueLeads = await this.leadProgressRepository.find({
        where: {
          status: 'active',
          nextRunAt: LessThanOrEqual(now),
        },
        relations: { cadence: true },
        take: 20, // Process in batches
      });

      for (const lead of dueLeads) {
        if (!lead.cadence || !lead.cadence.enabled) continue;

        // Guard: Contato protegido em atendimento manual
        if (isProtectedContact(lead.phone)) {
          this.logger.warn(
            `[Guard Blocked] Lead ${lead.phone} está sob guarda de atendimento manual. Cadência pausada.`,
          );
          lead.status = 'manual_protected_paused';
          lead.nextRunAt = null;
          await this.leadProgressRepository.save(lead);
          continue;
        }

        // Roteamento inteligente de chip por nicho
        const targetChip = resolveChipForNiche(String(lead.variables?.nicho || lead.cadence?.name || ''));
        const targetSessionId = lead.sessionId || targetChip.sessionId;

        // Guard: Trava de intervalo de 6 minutos (360s) por chip
        const intervalCheck = validateChipInterval(targetSessionId, 360);
        if (!intervalCheck.valid) {
          this.logger.log(
            `[Guard Delay] Chip ${targetSessionId} aguardando intervalo seguro (restam ${intervalCheck.remainingSeconds}s). Reagendando lead ${lead.phone}.`,
          );
          lead.nextRunAt = new Date(Date.now() + (intervalCheck.remainingSeconds + 5) * 1000);
          await this.leadProgressRepository.save(lead);
          continue;
        }

        if (!this.isWithinWorkingHours(lead.cadence)) {
          // Reschedule for next morning inside working hours
          const nextWorkingTime = new Date();
          nextWorkingTime.setHours(lead.cadence.startHour, 0, 0, 0);
          if (nextWorkingTime <= now) {
            nextWorkingTime.setDate(nextWorkingTime.getDate() + 1);
          }
          lead.nextRunAt = nextWorkingTime;
          await this.leadProgressRepository.save(lead);
          continue;
        }

        const nextStepOrder = lead.currentStep + 1;
        const targetStep = await this.cadenceStepRepository.findOne({
          where: {
            cadenceId: lead.cadenceId,
            stepOrder: nextStepOrder,
          },
        });

        if (!targetStep) {
          // Reached end of 10 touches!
          lead.status = 'completed';
          lead.nextRunAt = null;
          await this.leadProgressRepository.save(lead);
          this.logger.log(`[Cadence Completed] Lead ${lead.phone} finished all steps in cadence ${lead.cadenceId}`);
          continue;
        }

        // Render message with spintax & variables
        const messageText = renderTemplate(targetStep.messageTemplate, lead);

        try {
          this.logger.log(
            `[Cadence Sending] Touch ${targetStep.stepOrder}/10 -> ${lead.phone} (Cadence ${lead.cadence.name})`,
          );

          const messageSvc = this.getMessageService();
          if (messageSvc) {
            await messageSvc.sendText(targetSessionId, {
              chatId: lead.phone,
              text: messageText,
            });
            recordChipSentTimestamp(targetSessionId);
          }

          // Update progress
          lead.currentStep = nextStepOrder;
          lead.lastSentAt = new Date();

          // Sync progress to Supabase
          void this.supabaseSync.updateLeadStatusInSupabase(lead.phone, {
            status: 'active',
            current_step: nextStepOrder,
          });

          // Calculate next step delay (hours -> ms)
          const nextStepOrderCheck = nextStepOrder + 1;
          const nextStepObj = await this.cadenceStepRepository.findOne({
            where: {
              cadenceId: lead.cadenceId,
              stepOrder: nextStepOrderCheck,
            },
          });

          if (nextStepObj) {
            const delayMs = nextStepObj.delayHours * 3600 * 1000;
            // Add randomized anti-ban delay (jitter)
            const minDelay = (lead.cadence.minDelaySeconds || 45) * 1000;
            const maxDelay = (lead.cadence.maxDelaySeconds || 120) * 1000;
            const jitterMs = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

            lead.nextRunAt = new Date(Date.now() + delayMs + jitterMs);
          } else {
            lead.status = 'completed';
            lead.nextRunAt = null;
          }

          lead.lastError = null;
          await this.leadProgressRepository.save(lead);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to send cadence step to ${lead.phone}: ${errMsg}`);
          lead.lastError = errMsg;
          // Retry in 10 minutes
          lead.nextRunAt = new Date(Date.now() + 10 * 60 * 1000);
          await this.leadProgressRepository.save(lead);
        }

        // Anti-ban delay between different leads in the batch
        const batchJitter = Math.floor(Math.random() * 5000) + 3000;
        await new Promise(res => setTimeout(res, batchJitter));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Switches a lead to a new cadence (e.g. nurture sequence).
   * Resets step counter to 0 and sets status back to 'active'.
   */
  async switchCadence(leadPhoneOrId: string, targetCadenceId: string): Promise<LeadCadenceProgress | null> {
    let lead = await this.leadProgressRepository.findOne({
      where: [{ id: leadPhoneOrId }, { phone: leadPhoneOrId }],
    });

    if (!lead) {
      this.logger.warn(`Cannot switch cadence: lead ${leadPhoneOrId} not found`);
      return null;
    }

    // Resolve target cadence by ID or Name
    let targetCadence = await this.cadenceRepository.findOne({ where: { id: targetCadenceId } });
    if (!targetCadence) {
      targetCadence = await this.cadenceRepository.findOne({ where: { name: targetCadenceId } });
    }

    const cadenceIdToUse = targetCadence ? targetCadence.id : targetCadenceId;

    lead.cadenceId = cadenceIdToUse;
    lead.currentStep = 0;
    lead.status = 'nurture_cadence';
    lead.nextRunAt = new Date(Date.now() + 60 * 1000); // Start nurture in 1 minute
    lead.lastError = null;

    lead = await this.leadProgressRepository.save(lead);
    this.logger.log(`Switched lead ${lead.phone} to cadence ${cadenceIdToUse}`);

    void this.supabaseSync.updateLeadStatusInSupabase(lead.phone, {
      status: 'nurture_cadence',
      current_step: 0,
    });

    return lead;
  }

  /**
   * Resumes cadence progress for a lead from their last step, optionally injecting contextual variables.
   */
  async resumeFromLastStep(leadPhoneOrId: string, contextMessage?: string): Promise<LeadCadenceProgress | null> {
    let lead = await this.leadProgressRepository.findOne({
      where: [{ id: leadPhoneOrId }, { phone: leadPhoneOrId }],
    });

    if (!lead) {
      this.logger.warn(`Cannot resume cadence: lead ${leadPhoneOrId} not found`);
      return null;
    }

    if (contextMessage) {
      lead.variables = {
        ...(lead.variables || {}),
        reengageContext: contextMessage,
      };
    }

    lead.status = 'reengaged';
    lead.nextRunAt = new Date(Date.now() + 30 * 1000); // Schedule next step in 30 seconds
    lead.lastError = null;

    lead = await this.leadProgressRepository.save(lead);
    this.logger.log(
      `Resumed cadence for lead ${lead.phone} (step ${lead.currentStep}) with context: "${contextMessage || 'none'}"`,
    );

    void this.supabaseSync.updateLeadStatusInSupabase(lead.phone, {
      status: 'reengaged',
    });

    return lead;
  }
}
