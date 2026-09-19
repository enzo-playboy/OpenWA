import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createLogger } from '../../common/services/logger.service';
import { LlmProviderChainService, ChatMessage } from '../ai-agent/llm-provider-chain.service';
import { AiFeedbackLoopService } from '../ai-agent/ai-feedback-loop.service';
import {
  AgentLeadInput,
  GeneratedMessage,
  OpeningStyleInsight,
  OpeningStylePerformanceSummary,
  QualificationResult,
} from './agents.types';

/**
 * Message Generation Agent.
 *
 * Writes the first-touch WhatsApp message personalized by niche/company/history. Primary path is
 * the LLM provider chain; fallback is a niche template. The output is a PROPOSAL — nothing is
 * sent until a human approves.
 *
 * LEARNING LOOP: before writing, the agent reads the engagement history (AiFeedbackLoopService)
 * to see WHICH opening styles actually got replies — question vs statement vs context vs
 * direct_offer — and steers the LLM prompt (and the template pick) toward what has been answered,
 * not merely what has been sent. Every dispatched message is later tracked (trackSentMessage) and
 * every lead reply closes the loop (recordLeadReply), so the insight improves with volume.
 *
 * Hard content rules enforced regardless of source: no markdown/asterisks, no bullet lists, no
 * links, max ~600 chars (2-3 short paragraphs).
 */

const MAX_MESSAGE_LENGTH = 600;

/** Minimum sends per style before its response rate is trusted over the neutral prior. */
const MIN_STYLE_SAMPLE = 5;

const SYSTEM_PROMPT = `Você é um SDR humano escrevendo a primeira mensagem de prospecção no WhatsApp para um lead B2B no Brasil.

REGRAS OBRIGATÓRIAS:
- Português brasileiro informal-profissional ("você", nunca "Senhor(a)").
- Máximo 600 caracteres, 2-3 parágrafos curtos, SEM markdown, SEM asteriscos, SEM listas, SEM links.
- Primeira linha: cumprimento curto + por que você está falando (referência específica à empresa/nicho).
- Segunda parte: UMA pergunta leve que convide a conversa (não pergunte 3 coisas).
- NÃO invente fatos sobre a empresa. Use apenas as informações fornecidas.
- NÃO prometa desconto, preço ou prazo. NÃO pareça script de robô.

Responda APENAS com o texto da mensagem, sem aspas, sem comentários.`;

/**
 * Template variants keyed by the opening style they open with. The style pick comes from the
 * engagement insight (best answered style) instead of a fixed default, so even the fallback
 * learns. 'question' is the neutral prior: asking one light question is the safest opener.
 */
const STYLE_TEMPLATES: Record<OpeningStylePerformanceSummary['style'], (lead: AgentLeadInput) => string> = {
  question: lead =>
    `Oi${lead.name ? ` ${lead.name.split(' ')[0]}` : ''}! tudo bem? Achamos o contato de vocês pesquisando por ${lead.niche === 'ouro' ? 'joalherias e compra de ouro' : 'irrigação e soluções hídricas no agro'}.\n\n` +
    `Hoje ${lead.company || 'a operação de vocês'} trabalha mais com ${lead.niche === 'ouro' ? 'venda de ouro ou compra pra revenda' : 'gotejamento, aspersão ou ainda depende de chuva'}?`,
  context: lead =>
    `Oi${lead.name ? ` ${lead.name.split(' ')[0]}` : ''}! Vi o trabalho de vocês${lead.company ? ` (${lead.company})` : ''} e me chamou atenção a ${lead.niche === 'ouro' ? 'linha de joias e semijoias' : 'estrutura de irrigação'}.\n\n` +
    `A gente ajuda negócios assim a ${lead.niche === 'ouro' ? 'vender ouro com cotação justa e processo simples' : 'economizar água e ganhar produtividade no planejamento de irrigação'}. Faz sentido conversar?`,
  statement: lead =>
    `Oi${lead.name ? ` ${lead.name.split(' ')[0]}` : ''}! tudo bem? Somos especialistas em ${lead.niche === 'ouro' ? 'compra e venda de ouro com cotação diária' : 'irrigação e nutrição vegetal para lavoura'}.\n\n` +
    `Se algum dia fizer sentido pra ${lead.company || 'você'}, é só chamar. Qualquer coisa me avisa!`,
  direct_offer: lead =>
    `Oi${lead.name ? ` ${lead.name.split(' ')[0]}` : ''}! tudo bem? Trabalho com ${lead.niche === 'ouro' ? 'liquidação de ouro com pagamento rápido' : 'projetos de irrigação com diagnóstico gratuito'} e atendo ${lead.company || 'vários negócios da região'}.\n\n` +
    `Quer que eu te passe como funciona, sem compromisso?`,
};

@Injectable()
export class MessageGenerationAgent {
  private readonly logger = createLogger('MessageGenerationAgent');
  private feedbackLoop?: AiFeedbackLoopService;

  constructor(
    private readonly llm: LlmProviderChainService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /** Wire the feedback loop lazily (avoids module import cycles at construction time). */
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

  async generate(lead: AgentLeadInput, qualification: QualificationResult): Promise<GeneratedMessage> {
    const insight = await this.readStyleInsight();

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT + this.styleGuidance(insight) },
        { role: 'user', content: JSON.stringify(this.messageContext(lead, qualification)) },
      ];
      const { reply, providerUsed } = await this.llm.executeWithFallback(messages, 'agents-message');
      const text = this.sanitize(reply);
      if (this.acceptable(text)) {
        return {
          text,
          personalization: this.personalizationLevel(text, lead),
          confidence: qualification.source === 'llm' ? 0.8 : 0.6,
          source: 'llm',
          openingStyle: this.classifyOpeningStyle(text),
          styleInsight: insight,
        };
      }
      this.logger.warn(`Message LLM (${providerUsed}) output rejected by content rules; using template.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Message LLM chain failed; using template: ${msg}`);
    }
    return this.template(lead, insight);
  }

  /** Deterministic fallback, style chosen by what has actually been answered. */
  template(lead: AgentLeadInput, insight?: OpeningStyleInsight): GeneratedMessage {
    const style = this.pickStyle(insight);
    const factory = STYLE_TEMPLATES[style] ?? STYLE_TEMPLATES.question;
    return {
      text: factory(lead),
      personalization: lead.company ? 'referenced' : 'basic',
      confidence: 0.55,
      source: 'template',
      openingStyle: style,
      styleInsight: insight,
    };
  }

  /**
   * Reads the opening-style performance from the feedback loop and derives the insight. With
   * fewer than MIN_STYLE_SAMPLE sends per style, the sample is flagged untrustworthy and the
   * agent keeps neutral priors (question first) instead of chasing noise.
   */
  async readStyleInsight(): Promise<OpeningStyleInsight> {
    const styles: OpeningStylePerformanceSummary[] = [];
    try {
      const report = await this.getFeedbackLoop()?.getOpeningStylePerformanceReport();
      for (const row of report ?? []) {
        styles.push({
          style: row.openingStyle,
          totalSent: row.totalSent,
          responseRatePercent: row.responseRatePercent,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Style insight unavailable; using neutral priors: ${msg}`);
    }

    const eligible = styles.filter(s => s.totalSent >= MIN_STYLE_SAMPLE);
    const best = [...eligible].sort((a, b) => b.responseRatePercent - a.responseRatePercent)[0] ?? null;
    const totalSample = styles.reduce((sum, s) => sum + s.totalSent, 0);
    return {
      styles,
      bestStyle: best,
      insufficientSample: totalSample < MIN_STYLE_SAMPLE * 2,
    };
  }

  /**
   * The one-liner appended to the LLM system prompt: tells the model which opening style has
   * been getting replies and which has not. Empty when the sample is too small to steer with.
   */
  private styleGuidance(insight: OpeningStyleInsight): string {
    if (insight.insufficientSample || !insight.bestStyle) return '';
    const ranked = [...insight.styles]
      .filter(s => s.totalSent >= MIN_STYLE_SAMPLE)
      .sort((a, b) => b.responseRatePercent - a.responseRatePercent);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    let guidance = `\n\nDADO REAL DE DESEMPENHO (histórico de envios):`;
    for (const s of ranked) {
      guidance += `\n- Abertura '${s.style}': ${s.totalSent} envios, ${s.responseRatePercent}% de resposta`;
    }
    if (worst && worst.style !== best.style && best.responseRatePercent - worst.responseRatePercent >= 10) {
      guidance += `\nEVITE abrir com '${worst.style}': tem performance claramente pior. Prefira '${best.style}'.`;
    }
    return guidance;
  }

  /** Style pick for the template fallback: best answered style, or the neutral prior. */
  private pickStyle(insight?: OpeningStyleInsight): OpeningStylePerformanceSummary['style'] {
    if (!insight?.insufficientSample && insight?.bestStyle) {
      return insight.bestStyle.style;
    }
    return 'question';
  }

  /** Mirrors AiFeedbackLoopService.classifyOpeningStyle so the agent reports what it wrote. */
  private classifyOpeningStyle(text: string): OpeningStylePerformanceSummary['style'] {
    if (!text || text.trim() === '') return 'statement';
    const firstSentence = text.trim().split('\n')[0].toLowerCase();
    if (firstSentence.endsWith('?') || /^(você|como|qual|quais|já|será|tudo bem|olá.*?\?)/i.test(firstSentence)) {
      return 'question';
    }
    if (/^(vi que|percebi que|notei que|conforme|aproveitando|anotei)/i.test(firstSentence)) {
      return 'context';
    }
    if (/(oferta|desconto|preço especial|promoção|condição única|lote especial)/i.test(text)) {
      return 'direct_offer';
    }
    return 'statement';
  }

  private acceptable(text: string): boolean {
    return text.length >= 40 && text.length <= MAX_MESSAGE_LENGTH;
  }

  private messageContext(lead: AgentLeadInput, qualification: QualificationResult): Record<string, unknown> {
    return {
      lead: {
        name: lead.name ?? null,
        company: lead.company ?? null,
        niche: lead.niche,
        notes: lead.notes ?? null,
      },
      qualification: {
        score: qualification.score,
        reasons: qualification.reasons,
      },
      touchesAlreadySent: lead.previousTouches?.length ?? 0,
      lastTouch: lead.previousTouches?.at(-1) ?? null,
    };
  }

  private personalizationLevel(text: string, lead: AgentLeadInput): GeneratedMessage['personalization'] {
    const mentionsCompany = Boolean(lead.company && text.toLowerCase().includes(lead.company.toLowerCase()));
    const mentionsName = Boolean(lead.name && text.toLowerCase().includes(lead.name.split(' ')[0].toLowerCase()));
    return mentionsCompany || mentionsName ? 'referenced' : 'basic';
  }

  private sanitize(raw: string): string {
    if (!raw) return '';
    let text = raw
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (text.length > MAX_MESSAGE_LENGTH) {
      const cut = text.slice(0, MAX_MESSAGE_LENGTH);
      const lastBreak = cut.lastIndexOf('\n');
      text = (lastBreak > 200 ? cut.slice(0, lastBreak) : cut).trim();
    }
    return text;
  }
}
