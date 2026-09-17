import { LlmProviderChainService, LlmProviderConfig } from '../llm-provider-chain.service';

describe('LlmProviderChainService (Priority 2 - Provider Resilience & Fallback Chains)', () => {
  let providerChainSvc: LlmProviderChainService;
  let mockEventEmitter: any;
  let originalFetch: any;

  beforeEach(() => {
    mockEventEmitter = {
      emit: jest.fn(),
    };
    providerChainSvc = new LlmProviderChainService(mockEventEmitter);

    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1. should successfully respond using Provider 1 (Groq) when primary is operational', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Olá! Sou a IA de atendimento.' } }],
        usage: { total_tokens: 120 },
      }),
    } as any);

    const result = await providerChainSvc.executeWithFallback([{ role: 'user', content: 'Olá!' }], 'chip-2-iphone');

    expect(result.reply).toBe('Olá! Sou a IA de atendimento.');
    expect(result.providerUsed).toBe('groq');
    expect(result.tokensUsed).toBe(120);

    const metrics = providerChainSvc.getMetrics('chip-2-iphone');
    expect(metrics).toHaveLength(1);
    expect(metrics[0].providerId).toBe('groq');
    expect(metrics[0].success).toBe(true);
  });

  it('2. should failover to Provider 2 (OpenRouter/Gemini) when Provider 1 throws error', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes('api.groq.com')) {
        return { ok: false, status: 500, text: async () => 'Groq Rate Limit Exceeded' };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Resposta via Gemini / OpenRouter' } }],
          usage: { total_tokens: 200 },
        }),
      };
    });

    const result = await providerChainSvc.executeWithFallback(
      [{ role: 'user', content: 'Quero orçar semi-jóias' }],
      'chip-2-iphone',
    );

    expect(result.reply).toBe('Resposta via Gemini / OpenRouter');
    expect(result.providerUsed).toBe('openrouter');

    const summary = providerChainSvc.getMetricsSummary();
    expect(summary['groq'].successRate).toBe(0);
    expect(summary['openrouter'].successRate).toBe(1);
  });

  it('3. should trip Circuit Breaker on repeated provider failures and bypass provider', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    } as any);

    const testChain: LlmProviderConfig[] = [
      {
        id: 'test-failing-provider',
        name: 'Failing Provider',
        baseUrl: 'https://failing-api.com',
        apiKey: 'key-123',
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.7,
        costPer1kTokens: 0.001,
      },
    ];

    // Execute first call (2 attempts fail -> 1 failure recorded)
    await providerChainSvc.executeWithFallback([{ role: 'user', content: 'test' }], 'sess-1', testChain);
    // Execute second call -> 2 failures recorded
    await providerChainSvc.executeWithFallback([{ role: 'user', content: 'test' }], 'sess-1', testChain);
    // Execute third call -> 3 failures recorded -> Circuit TRIPPED
    await providerChainSvc.executeWithFallback([{ role: 'user', content: 'test' }], 'sess-1', testChain);

    expect(providerChainSvc.isCircuitOpen('test-failing-provider')).toBe(true);

    // Fourth call should instantly bypass without calling fetch
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockClear();

    const fallbackRes = await providerChainSvc.executeWithFallback(
      [{ role: 'user', content: 'test' }],
      'sess-1',
      testChain,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fallbackRes.providerUsed).toBe('fallback_human_standard');
  });

  it('4. should emit llm.all_providers_failed event and return standard human message when all caírem', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'All APIs Down',
    } as any);

    const result = await providerChainSvc.executeWithFallback([{ role: 'user', content: 'Socorro!' }], 'suportew');

    expect(result.providerUsed).toBe('fallback_human_standard');
    expect(result.reply).toContain('consultores humanos');
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'llm.all_providers_failed',
      expect.objectContaining({
        sessionId: 'suportew',
      }),
    );
  });
});
