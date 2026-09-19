import { Injectable } from '@nestjs/common';
import { createLogger } from '../../common/services/logger.service';
import { LlmProviderChainService, ChatMessage } from '../ai-agent/llm-provider-chain.service';
import { AgentLeadInput, QualificationResult } from './agents.types';

/**
 * Lead Qualification Agent.
 *
 * Scores a lead 0-100 and recommends CONTACT / HOLD / REJECT. Primary path is the LLM provider
 * chain (Groq -> OpenRouter -> OpenAI, with its own retries and circuit breaker); if every
 * provider fails, a deterministic heuristic keeps the pipeline alive instead of dying — the
 * heuristic is intentionally conservative (caps the score, never invents data it does not have).
 */

const SYSTEM_PROMPT = `Você é um analista de qualificação de leads de prospecção B2B no WhatsApp.
Analise o lead e responda APENAS com um JSON válido, sem texto ao redor, no formato:
{"score": <0-100>, "recommendation": "CONTACT"|"HOLD"|"REJECT", "reasons": ["..."], "dataQuality": "good"|"partial"|"poor", "confidence": <0-1>}

Critérios: nicho alinhado (joalheria/ouro ou agro/irrigação), completude dos dados (nome, empresa, notas),
indício de dor que nosso serviço resolve. Seja conservador: sem evidência, não invente.`;

@Injectable()
export class LeadQualificationAgent {
  private readonly logger = createLogger('LeadQualificationAgent');

  constructor(private readonly llm: LlmProviderChainService) {}

  async qualify(lead: AgentLeadInput): Promise<QualificationResult> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(this.leadFacts(lead)) },
      ];
      const { reply, providerUsed } = await this.llm.executeWithFallback(messages, 'agents-qualification');
      const parsed = this.parseLlmJson(reply);
      if (parsed) {
        return {
          score: this.clampScore(parsed.score),
          recommendation: this.validRecommendation(parsed.recommendation),
          reasons: this.stringArray(parsed.reasons).slice(0, 5),
          dataQuality: this.validDataQuality(parsed.dataQuality),
          confidence: this.clampConfidence(parsed.confidence),
          source: 'llm',
        };
      }
      this.logger.warn(`Qualification LLM (${providerUsed}) returned unparseable output; using heuristic.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Qualification LLM chain failed; using heuristic: ${msg}`);
    }
    return this.heuristic(lead);
  }

  /** Deterministic fallback: no LLM required, always produces a usable result. */
  heuristic(lead: AgentLeadInput): QualificationResult {
    const reasons: string[] = [];
    let score = 40; // neutral floor

    if (lead.name) {
      score += 10;
      reasons.push('Nome do contato disponível');
    }
    if (lead.company) {
      score += 15;
      reasons.push('Empresa identificada');
    }
    if (lead.notes && lead.notes.length >= 20) {
      score += 15;
      reasons.push('Notas do CRM com contexto suficiente');
    } else {
      reasons.push('Notas insuficientes para personalizar abordagem');
    }

    const hasPreviousTouches = (lead.previousTouches?.length ?? 0) > 0;
    if (hasPreviousTouches) {
      score += 5;
      reasons.push('Histórico de toques anteriores (reengajamento)');
    }

    const dataQuality = score >= 70 ? 'good' : score >= 50 ? 'partial' : 'poor';
    // Heuristic caps the score below the 70% consensus threshold so an unverified lead never
    // auto-dispatches: a CONTACT vote here still requires human approval.
    const cappedScore = Math.min(score, 65);
    const recommendation = cappedScore >= 55 ? 'CONTACT' : cappedScore >= 40 ? 'HOLD' : 'REJECT';

    return {
      score: cappedScore,
      recommendation,
      reasons,
      dataQuality,
      confidence: 0.5,
      source: 'heuristic',
    };
  }

  private leadFacts(lead: AgentLeadInput): Record<string, unknown> {
    return {
      phone: lead.phone,
      name: lead.name ?? null,
      company: lead.company ?? null,
      niche: lead.niche,
      notes: lead.notes ?? null,
      previousTouchesCount: lead.previousTouches?.length ?? 0,
      lastTouch: lead.previousTouches?.at(-1) ?? null,
    };
  }

  private parseLlmJson(reply: string): Record<string, unknown> | null {
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  private clampScore(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return 40;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private clampConfidence(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return 0.5;
    return Math.max(0, Math.min(1, n));
  }

  private validRecommendation(value: unknown): QualificationResult['recommendation'] {
    return value === 'CONTACT' || value === 'HOLD' || value === 'REJECT' ? value : 'HOLD';
  }

  private validDataQuality(value: unknown): QualificationResult['dataQuality'] {
    return value === 'good' || value === 'partial' || value === 'poor' ? value : 'partial';
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }
}
