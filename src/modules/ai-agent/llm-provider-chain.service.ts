import { Injectable, Optional } from '@nestjs/common';
import { createLogger } from '../../common/services/logger.service';

export interface EventEmitterLike {
  emit(event: string, ...args: any[]): boolean;
}

export interface LlmApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
}

export interface LlmProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  costPer1kTokens: number; // In USD
}

export interface CircuitBreakerState {
  failures: number;
  openUntil: number; // Timestamp ms when circuit closes
}

export interface ProviderMetricRecord {
  providerId: string;
  sessionId: string;
  model: string;
  latencyMs: number;
  tokensUsed: number;
  estimatedCostUsd: number;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class LlmProviderChainService {
  private readonly logger = createLogger('LlmProviderChainService');
  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();
  private readonly metrics: ProviderMetricRecord[] = [];

  constructor(@Optional() private readonly eventEmitter?: EventEmitterLike) {}

  /**
   * Return default fallback chain of providers.
   * Chain: Groq -> OpenRouter / Gemini -> OpenAI / Local Contingency
   */
  getDefaultChain(): LlmProviderConfig[] {
    return [
      {
        id: 'groq',
        name: 'Groq Cloud LLM',
        baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY || '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',
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        maxTokens: 500,
        temperature: 0.7,
        costPer1kTokens: 0.0005,
      },
      {
        id: 'openrouter',
        name: 'OpenRouter (Gemini)',
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || 'sk-or-v1-dev-key',
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-free',
        maxTokens: 500,
        temperature: 0.7,
        costPer1kTokens: 0.0002,
      },
      {
        id: 'openai',
        name: 'OpenAI Contingency',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || 'sk-proj-dev-contingency-key',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        maxTokens: 500,
        temperature: 0.7,
        costPer1kTokens: 0.0015,
      },
    ];
  }

  isCircuitOpen(providerId: string): boolean {
    const cb = this.circuitBreakers.get(providerId);
    if (!cb) return false;
    if (cb.openUntil > 0) {
      if (Date.now() < cb.openUntil) {
        return true; // Circuit is OPEN (bypassing provider)
      }
      // Circuit window expired -> reset to half-open
      this.circuitBreakers.delete(providerId);
      return false;
    }
    return false;
  }

  recordFailure(providerId: string): void {
    const cb = this.circuitBreakers.get(providerId) || { failures: 0, openUntil: 0 };
    cb.failures += 1;
    if (cb.failures >= 3) {
      cb.openUntil = Date.now() + 60_000; // Open circuit for 60 seconds
      this.logger.warn(
        `[Circuit Breaker TRIPPED] Provider '${providerId}' open for 60s due to 3 consecutive failures.`,
      );
    }
    this.circuitBreakers.set(providerId, cb);
  }

  recordSuccess(providerId: string): void {
    this.circuitBreakers.delete(providerId);
  }

  getMetrics(sessionId?: string): ProviderMetricRecord[] {
    if (sessionId) {
      return this.metrics.filter(m => m.sessionId === sessionId);
    }
    return [...this.metrics];
  }

  getMetricsSummary(): Record<
    string,
    { calls: number; successRate: number; avgLatencyMs: number; totalCostUsd: number }
  > {
    const summary: Record<string, { calls: number; successRate: number; avgLatencyMs: number; totalCostUsd: number }> =
      {};

    for (const m of this.metrics) {
      if (!summary[m.providerId]) {
        summary[m.providerId] = { calls: 0, successRate: 0, avgLatencyMs: 0, totalCostUsd: 0 };
      }
      const s = summary[m.providerId];
      s.calls += 1;
      if (m.success) s.successRate += 1;
      s.avgLatencyMs += m.latencyMs;
      s.totalCostUsd += m.estimatedCostUsd;
    }

    for (const pid of Object.keys(summary)) {
      const s = summary[pid];
      s.avgLatencyMs = s.calls > 0 ? Math.round(s.avgLatencyMs / s.calls) : 0;
      s.successRate = s.calls > 0 ? parseFloat((s.successRate / s.calls).toFixed(2)) : 0;
      s.totalCostUsd = parseFloat(s.totalCostUsd.toFixed(6));
    }

    return summary;
  }

  /**
   * Execute chat completion through multi-provider fallback chain with retry & circuit breaker.
   */
  async executeWithFallback(
    messages: ChatMessage[],
    sessionId = 'chip-default',
    customChain?: LlmProviderConfig[],
  ): Promise<{ reply: string; providerUsed: string; latencyMs: number; tokensUsed: number }> {
    const chain = customChain && customChain.length > 0 ? customChain : this.getDefaultChain();
    let lastErrorMsg = 'No providers available';

    for (const provider of chain) {
      if (!provider.apiKey || provider.apiKey.trim() === '') {
        this.logger.log(`Skipping provider '${provider.id}': API Key not configured.`);
        continue;
      }

      if (this.isCircuitOpen(provider.id)) {
        this.logger.warn(`[Circuit Breaker] Bypassing provider '${provider.id}' (Circuit is OPEN).`);
        continue;
      }

      // Try calling provider with retry (max 2 retries with exponential backoff)
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const startTime = Date.now();
        try {
          this.logger.log(
            `Calling LLM Provider '${provider.id}' (${provider.model}) [Attempt ${attempt}/${maxRetries}] for session ${sessionId}...`,
          );

          const response = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${provider.apiKey}`,
              'HTTP-Referer': 'https://openwa.dev',
              'X-Title': 'OpenWA Resilience Agent',
            },
            body: JSON.stringify({
              model: provider.model,
              messages,
              temperature: provider.temperature,
              max_tokens: provider.maxTokens,
            }),
          });

          const latencyMs = Date.now() - startTime;

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
          }

          const rawData: unknown = await response.json();
          const data = rawData as LlmApiResponse;
          const reply = data.choices?.[0]?.message?.content?.trim();

          if (!reply) {
            throw new Error('LLM API returned empty choice content');
          }

          const tokensUsed = data.usage?.total_tokens || 150;
          const estimatedCostUsd = (tokensUsed / 1000) * provider.costPer1kTokens;

          // Record success telemetry & reset circuit breaker
          this.recordSuccess(provider.id);
          this.metrics.push({
            providerId: provider.id,
            sessionId,
            model: provider.model,
            latencyMs,
            tokensUsed,
            estimatedCostUsd,
            success: true,
            timestamp: new Date(),
          });

          this.logger.log(
            `[LLM Success] Provider '${provider.id}' responded in ${latencyMs}ms (${tokensUsed} tokens, ~$${estimatedCostUsd.toFixed(5)}).`,
          );

          return { reply, providerUsed: provider.id, latencyMs, tokensUsed };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          lastErrorMsg = `${provider.id} attempt ${attempt} failed: ${errMsg}`;
          this.logger.warn(lastErrorMsg);

          if (attempt < maxRetries) {
            // Exponential backoff delay (300ms, 600ms)
            const delayMs = 300 * Math.pow(2, attempt - 1);
            await new Promise(res => setTimeout(res, delayMs));
          } else {
            // Failed all retries for this provider -> trip circuit breaker & move to next provider
            this.recordFailure(provider.id);
            this.metrics.push({
              providerId: provider.id,
              sessionId,
              model: provider.model,
              latencyMs: Date.now() - startTime,
              tokensUsed: 0,
              estimatedCostUsd: 0,
              success: false,
              errorMessage: errMsg,
              timestamp: new Date(),
            });
          }
        }
      }
    }

    // ALL PROVIDERS FAILED
    this.logger.error(`[CRITICAL] All LLM providers in fallback chain failed! Last error: ${lastErrorMsg}`);

    if (this.eventEmitter) {
      this.eventEmitter.emit('llm.all_providers_failed', {
        sessionId,
        lastError: lastErrorMsg,
        timestamp: new Date(),
      });
    }

    // Standard human fallback response
    return {
      reply:
        'Olá! Nosso assistente inteligente está enfrentando uma oscilação momentânea de conexão. Um de nossos consultores humanos dará continuidade ao seu atendimento em breve!',
      providerUsed: 'fallback_human_standard',
      latencyMs: 0,
      tokensUsed: 0,
    };
  }
}
