import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MessageEngagement, OpeningStyle } from './entities/message-engagement.entity';
import { createLogger } from '../../common/services/logger.service';

export interface PersonaPerformance {
  personaId: string;
  totalSent: number;
  totalReplied: number;
  responseRatePercent: number;
  avgReplyLatencyMinutes: number;
  qualifiedCount: number;
  qualifiedRatePercent: number;
}

export interface OpeningStylePerformance {
  openingStyle: OpeningStyle;
  totalSent: number;
  totalReplied: number;
  responseRatePercent: number;
}

export interface PromptRecommendation {
  type: 'persona_tuning' | 'style_shift' | 'system_prompt_adjustment';
  insight: string;
  recommendedAction: string;
  confidenceScore: number;
}

@Injectable()
export class AiFeedbackLoopService {
  private readonly logger = createLogger('AiFeedbackLoopService');

  constructor(
    @InjectRepository(MessageEngagement, 'data')
    private readonly engagementRepo: Repository<MessageEngagement>,
  ) {}

  classifyOpeningStyle(text: string): OpeningStyle {
    if (!text || text.trim() === '') return 'statement';
    const trimmed = text.trim();
    const firstSentence = trimmed.split('\n')[0].toLowerCase();

    if (firstSentence.endsWith('?') || /^(você|como|qual|quais|já|será|tudo bem|olá.*?\?)/i.test(firstSentence)) {
      return 'question';
    }
    if (/^(vi que|percebi que|notei que|conforme|aproveitando|anotei)/i.test(firstSentence)) {
      return 'context';
    }
    if (/(oferta|desconto|preço especial|promoção|condição única|lote especial)/i.test(trimmed)) {
      return 'direct_offer';
    }

    return 'statement';
  }

  hashMessage(text: string): string {
    return crypto.createHash('sha256').update(text.trim()).digest('hex').substring(0, 16);
  }

  async trackSentMessage(
    leadId: string,
    phone: string,
    sessionId: string,
    personaId: string,
    messageText: string,
  ): Promise<MessageEngagement> {
    const openingStyle = this.classifyOpeningStyle(messageText);
    const messageHash = this.hashMessage(messageText);

    const engagement = this.engagementRepo.create({
      leadId,
      phone,
      sessionId: sessionId || 'chip-default',
      personaId: personaId || 'sdr-default',
      openingStyle,
      messageHash,
      sentAt: new Date(),
      leadReplied: false,
      repliedAt: null,
      replyLatencyMinutes: null,
      outcome: null,
    });

    const saved = await this.engagementRepo.save(engagement);
    this.logger.log(
      `[Feedback Loop Tracked] Sent msg to ${phone} (Persona: ${personaId}, Style: ${openingStyle}, Hash: ${messageHash})`,
    );
    return saved;
  }

  async recordLeadReply(phoneOrLeadId: string, outcome?: string): Promise<MessageEngagement | null> {
    const latestSent = await this.engagementRepo.findOne({
      where: [{ phone: phoneOrLeadId }, { leadId: phoneOrLeadId }],
      order: { sentAt: 'DESC' },
    });

    if (!latestSent) {
      this.logger.warn(`No sent message found to attach lead reply for ${phoneOrLeadId}`);
      return null;
    }

    if (latestSent.leadReplied) {
      this.logger.log(`Message engagement already recorded for ${phoneOrLeadId}`);
      return latestSent;
    }

    const now = new Date();
    const latencyMinutes = Math.max(0, Math.round((now.getTime() - new Date(latestSent.sentAt).getTime()) / 60000));

    latestSent.leadReplied = true;
    latestSent.repliedAt = now;
    latestSent.replyLatencyMinutes = latencyMinutes;
    if (outcome) {
      latestSent.outcome = outcome;
    }

    const updated = await this.engagementRepo.save(latestSent);
    this.logger.log(
      `[Feedback Loop Reply Recorded] Lead ${phoneOrLeadId} replied after ${latencyMinutes}m (Style: ${latestSent.openingStyle}, Outcome: ${outcome || 'none'})`,
    );
    return updated;
  }

  async getPersonaPerformanceReport(): Promise<PersonaPerformance[]> {
    const all = await this.engagementRepo.find();
    const groups: Record<string, MessageEngagement[]> = {};

    for (const item of all) {
      const pid = item.personaId || 'sdr-default';
      if (!groups[pid]) groups[pid] = [];
      groups[pid].push(item);
    }

    const report: PersonaPerformance[] = [];

    for (const [personaId, items] of Object.entries(groups)) {
      const totalSent = items.length;
      const repliedItems = items.filter(i => i.leadReplied);
      const totalReplied = repliedItems.length;
      const responseRatePercent = totalSent > 0 ? parseFloat(((totalReplied / totalSent) * 100).toFixed(1)) : 0;

      const totalLatency = repliedItems.reduce((acc, curr) => acc + (curr.replyLatencyMinutes || 0), 0);
      const avgReplyLatencyMinutes = totalReplied > 0 ? Math.round(totalLatency / totalReplied) : 0;

      const qualifiedItems = items.filter(i => i.outcome === 'qualified');
      const qualifiedCount = qualifiedItems.length;
      const qualifiedRatePercent = totalSent > 0 ? parseFloat(((qualifiedCount / totalSent) * 100).toFixed(1)) : 0;

      report.push({
        personaId,
        totalSent,
        totalReplied,
        responseRatePercent,
        avgReplyLatencyMinutes,
        qualifiedCount,
        qualifiedRatePercent,
      });
    }

    return report;
  }

  async getOpeningStylePerformanceReport(): Promise<OpeningStylePerformance[]> {
    const all = await this.engagementRepo.find();
    const styles: OpeningStyle[] = ['question', 'statement', 'context', 'direct_offer'];
    const report: OpeningStylePerformance[] = [];

    for (const style of styles) {
      const items = all.filter(i => i.openingStyle === style);
      const totalSent = items.length;
      const totalReplied = items.filter(i => i.leadReplied).length;
      const responseRatePercent = totalSent > 0 ? parseFloat(((totalReplied / totalSent) * 100).toFixed(1)) : 0;

      report.push({
        openingStyle: style,
        totalSent,
        totalReplied,
        responseRatePercent,
      });
    }

    return report;
  }

  async generatePromptOptimizationRecommendations(): Promise<PromptRecommendation[]> {
    const personaReport = await this.getPersonaPerformanceReport();
    const styleReport = await this.getOpeningStylePerformanceReport();
    const recommendations: PromptRecommendation[] = [];

    // Analyze opening styles
    const sortedStyles = [...styleReport].sort((a, b) => b.responseRatePercent - a.responseRatePercent);
    if (sortedStyles.length > 0 && sortedStyles[0].totalSent >= 3) {
      const bestStyle = sortedStyles[0];
      const worstStyle = sortedStyles[sortedStyles.length - 1];

      if (bestStyle.responseRatePercent > worstStyle.responseRatePercent + 10) {
        recommendations.push({
          type: 'style_shift',
          insight: `Mensagens com estilo de abertura '${bestStyle.openingStyle}' possuem taxa de resposta de ${bestStyle.responseRatePercent}%, comparado a ${worstStyle.responseRatePercent}% no estilo '${worstStyle.openingStyle}'.`,
          recommendedAction: `Ajustar os templates e prompts para priorizar ganchos do tipo '${bestStyle.openingStyle}' no início da abordagem.`,
          confidenceScore: 0.92,
        });
      }
    }

    // Analyze persona performance
    const sortedPersonas = [...personaReport].sort((a, b) => b.responseRatePercent - a.responseRatePercent);
    if (sortedPersonas.length >= 2) {
      const bestPersona = sortedPersonas[0];
      const worstPersona = sortedPersonas[sortedPersonas.length - 1];

      recommendations.push({
        type: 'persona_tuning',
        insight: `A persona '${bestPersona.personaId}' lidera com ${bestPersona.responseRatePercent}% de taxa de resposta e ${bestPersona.qualifiedRatePercent}% de conversão qualificada vs '${worstPersona.personaId}' (${worstPersona.responseRatePercent}%).`,
        recommendedAction: `Replicar os elementos de linguagem e tom de voz da persona '${bestPersona.personaId}' na persona '${worstPersona.personaId}'.`,
        confidenceScore: 0.88,
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'system_prompt_adjustment',
        insight: 'Dados de engajamento acumulando. Amostra atual em fase de consolidação estatística.',
        recommendedAction: 'Manter monitoramento de resposta até atingir volume representativo por persona.',
        confidenceScore: 0.7,
      });
    }

    return recommendations;
  }
}
