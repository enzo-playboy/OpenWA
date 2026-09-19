import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createLogger } from '../../common/services/logger.service';
import { MessageService } from '../message/message.service';
import { AgentsAlertsService } from './agents-alerts.service';
import { LeadResponderAgent, ResponderDecision } from './lead-responder.agent';

/**
 * Inbound bridge for the Lead Responder Agent.
 *
 * The message projector calls `handleInbound()` for every lead text message; this service runs
 * the responder agent and sends its reply. Three hard safety properties:
 *
 *  1. NO DOUBLE-REPLY: while this agent owns a conversation, Sofia (the legacy auto-responder in
 *     ai-agent.service) must stay silent for that chat. `isAgentHandled()` exposes that state, and
 *     the projector checks it BEFORE calling Sofia. A human takeover flips the state off.
 *  2. NO UNWANTED CONTACT: a refusal triggers the LGPD opt-out registry inside the agent — the
 *     goodbye message is the LAST thing that lead ever receives.
 *  3. NO RISKY GUESSING: low confidence or sensitive intents escalate to a human instead of
 *     replying (fail closed), and the conversation is left for the operator.
 *
 * Enabled via AGENT_AUTO_RESPOND=true; off by default (FASE 1 posture — human approves outbound).
 * The human gate for OUTBOUND prospecting is untouched: this only REACTS to a lead's own reply.
 */

export const AGENT_AUTO_RESPOND_ENV = 'AGENT_AUTO_RESPOND';

/** Chats currently owned by the responder agent (Sofia must not touch these). */
const agentHandledChats = new Set<string>();

@Injectable()
export class LeadResponderInboundService {
  private readonly logger = createLogger('LeadResponderInboundService');
  private messageService?: MessageService;

  constructor(
    private readonly responder: LeadResponderAgent,
    private readonly alerts: AgentsAlertsService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  private getMessageService(): MessageService | undefined {
    if (!this.messageService && this.moduleRef) {
      this.messageService = this.moduleRef.get(MessageService, { strict: false });
    }
    return this.messageService;
  }

  static get enabled(): boolean {
    return process.env[AGENT_AUTO_RESPOND_ENV] === 'true';
  }

  /** Whether this chat is currently handled by the agent (Sofia checks this before replying). */
  static isAgentHandled(chatId: string): boolean {
    return agentHandledChats.has(chatId);
  }

  static markAgentHandled(chatId: string): void {
    agentHandledChats.add(chatId);
  }

  /** Human took over: agent steps aside and Sofia may resume normal behavior. */
  static clearAgentHandled(chatId: string): void {
    agentHandledChats.delete(chatId);
  }

  /** Entry point wired from the message projector for lead text messages. */
  async handleInbound(sessionId: string, chatId: string, text: string): Promise<void> {
    if (!LeadResponderInboundService.enabled) return;
    if (!chatId || chatId.endsWith('@g.us')) return;
    if (!text || text.trim() === '') return;

    // Only conversations the pipeline actually started: an agent-handled chat or one with a
    // tracked engagement. Unknown cold chats stay with Sofia's existing behavior.
    if (!agentHandledChats.has(chatId)) return;

    try {
      const decision: ResponderDecision = await this.responder.handleLeadMessage(chatId, text);

      switch (decision.action) {
        case 'reply':
          await this.send(sessionId, chatId, decision.reply!);
          break;
        case 'opt_out':
          await this.send(sessionId, chatId, decision.reply!);
          this.logger.log(`[Responder] Lead ${chatId} opted out during conversation. Registry updated.`);
          this.alerts.alert('opt_out', 'Lead pediu exclusão (LGPD)', { lead: chatId }, chatId);
          break;
        case 'escalate':
          this.logger.warn(
            `[Responder] Escalated chat ${chatId} to a human (intent=${decision.intent}, confidence=${decision.confidence}).`,
          );
          this.alerts.alert(
            'escalation',
            'Conversa escalada pra humano',
            { lead: chatId, intencao: decision.intent },
            chatId,
          );
          // Operator-facing signal: webhook consumers can already listen to message.received;
          // the takeover state is cleared so Sofia's rules apply from here on.
          LeadResponderInboundService.clearAgentHandled(chatId);
          break;
        case 'wait':
          this.logger.log(`[Responder] Lead ${chatId} is busy; no reply sent, no further auto-touches.`);
          LeadResponderInboundService.clearAgentHandled(chatId);
          break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Responder inbound handling failed for ${chatId}: ${msg}`);
    }
  }

  private async send(sessionId: string, chatId: string, text: string): Promise<void> {
    const messageService = this.getMessageService();
    if (!messageService) {
      this.logger.warn('MessageService unavailable; responder reply not sent.');
      return;
    }
    await messageService.sendText(sessionId, { chatId, text });
  }
}
