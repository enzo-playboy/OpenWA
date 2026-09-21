import { ModuleRef } from '@nestjs/core';
import { LlmProviderChainService } from '../../ai-agent/llm-provider-chain.service';
import { AgentLeadInput } from '../agents.types';
import { LeadQualificationAgent } from '../lead-qualification.agent';
import { MessageGenerationAgent } from '../message-generation.agent';

type FeedbackReport = Array<{
  openingStyle: 'question' | 'statement' | 'context' | 'direct_offer';
  totalSent: number;
  responseRatePercent: number;
}>;

/** Minimal ModuleRef stub returning the given feedback-loop-like object. */
const moduleRefWith = (feedback?: { getOpeningStylePerformanceReport: () => Promise<FeedbackReport> }): ModuleRef =>
  ({ get: () => feedback }) as unknown as ModuleRef;

const baseLead: AgentLeadInput = {
  phone: '5534998762935',
  name: 'Maria Souza',
  company: 'Joalheria Teste',
  niche: 'ouro',
  notes: 'Joalheria com loja física, compra ouro de clientes e revende semijoias.',
};

describe('LeadQualificationAgent', () => {
  const makeAgent = (llm?: { executeWithFallback: jest.Mock }): LeadQualificationAgent =>
    new LeadQualificationAgent((llm ?? { executeWithFallback: jest.fn() }) as unknown as LlmProviderChainService);

  it('uses the LLM result when it returns valid JSON', async () => {
    const llm = {
      executeWithFallback: jest.fn().mockResolvedValue({
        reply:
          '{"score": 82, "recommendation": "CONTACT", "reasons": ["nicho alinhado"], "dataQuality": "good", "confidence": 0.9}',
        providerUsed: 'groq',
      }),
    };
    const result = await makeAgent(llm).qualify(baseLead);
    expect(result.source).toBe('llm');
    expect(result.score).toBe(82);
    expect(result.recommendation).toBe('CONTACT');
    expect(result.dataQuality).toBe('good');
  });

  it('falls back to the heuristic when the LLM chain fails', async () => {
    const llm = { executeWithFallback: jest.fn().mockRejectedValue(new Error('all providers down')) };
    const result = await makeAgent(llm).qualify(baseLead);
    expect(result.source).toBe('heuristic');
    expect(result.score).toBeLessThanOrEqual(65); // never crosses the consensus threshold
  });

  it('falls back when the LLM returns garbage', async () => {
    const llm = { executeWithFallback: jest.fn().mockResolvedValue({ reply: 'sem json aqui', providerUsed: 'groq' }) };
    const result = await makeAgent(llm).qualify(baseLead);
    expect(result.source).toBe('heuristic');
  });

  it('heuristic scores a rich lead CONTACT and a bare phone stays at the neutral floor (HOLD)', () => {
    const agent = makeAgent();
    const rich = agent.heuristic(baseLead);
    const bare = agent.heuristic({ phone: '1199999999', niche: 'agro' });
    expect(rich.score).toBeGreaterThan(bare.score);
    expect(bare.score).toBeLessThanOrEqual(40); // neutral floor: nothing verifiable
    expect(['HOLD', 'REJECT']).toContain(bare.recommendation);
  });
});

describe('MessageGenerationAgent', () => {
  const makeAgent = (
    llm?: { executeWithFallback: jest.Mock },
    feedback?: { getOpeningStylePerformanceReport: () => Promise<FeedbackReport> },
  ): MessageGenerationAgent =>
    new MessageGenerationAgent(
      (llm ?? { executeWithFallback: jest.fn() }) as unknown as LlmProviderChainService,
      moduleRefWith(feedback),
    );

  const qualification = {
    score: 70,
    recommendation: 'CONTACT' as const,
    reasons: ['ok'],
    dataQuality: 'good' as const,
    confidence: 0.8,
    source: 'llm' as const,
  };
  it('uses the LLM message when it passes the content rules', async () => {
    const llm = {
      executeWithFallback: jest.fn().mockResolvedValue({
        reply:
          'Oi Maria! tudo bem? Vi que a Joalheria Teste trabalha com compra de ouro.\n\nHoje vocês vendem mais ouro ou semijoia?',
        providerUsed: 'groq',
      }),
    };
    const result = await makeAgent(llm).generate(baseLead, qualification);
    expect(result.source).toBe('llm');
    expect(result.text).toContain('Maria');
    expect(result.text).not.toContain('*');
  });

  it('feeds real opening-style performance into the LLM prompt when the sample is trustworthy', async () => {
    const llm = {
      executeWithFallback: jest.fn().mockResolvedValue({
        reply:
          'Oi Maria! tudo bem? Vi a Joalheria Teste pesquisando compra de ouro.\n\nHoje vocês vendem ouro ou semijoia?',
        providerUsed: 'groq',
      }),
    };
    const feedback = {
      getOpeningStylePerformanceReport: jest.fn().mockResolvedValue([
        { openingStyle: 'question', totalSent: 40, responseRatePercent: 38.5 },
        { openingStyle: 'statement', totalSent: 35, responseRatePercent: 12.0 },
      ]),
    };
    await makeAgent(llm, feedback).generate(baseLead, qualification);
    const firstCall = (llm.executeWithFallback.mock.calls as unknown as Array<[unknown[]]>)[0];
    const systemPrompt = (firstCall[0][0] as { content: string }).content;
    expect(systemPrompt).toContain("Abertura 'question': 40 envios, 38.5%");
    expect(systemPrompt).toContain("EVITE abrir com 'statement'");
  });

  it('keeps neutral priors when the sample is too small to steer with', async () => {
    const llm = { executeWithFallback: jest.fn().mockResolvedValue({ reply: '', providerUsed: 'groq' }) };
    const feedback = {
      getOpeningStylePerformanceReport: jest
        .fn()
        .mockResolvedValue([{ openingStyle: 'direct_offer', totalSent: 2, responseRatePercent: 100 }]),
    };
    const agent = makeAgent(llm, feedback);
    const insight = await agent.readStyleInsight();
    const result = agent.template(baseLead, insight);
    expect(result.openingStyle).toBe('question'); // not 'direct_offer' — sample too small
    expect(result.styleInsight?.insufficientSample).toBe(true);
  });

  it('template fallback picks the best-answered style', () => {
    const feedback = {
      getOpeningStylePerformanceReport: jest.fn().mockResolvedValue([
        { openingStyle: 'question', totalSent: 40, responseRatePercent: 20 },
        { openingStyle: 'context', totalSent: 30, responseRatePercent: 45 },
        { openingStyle: 'statement', totalSent: 35, responseRatePercent: 10 },
      ]),
    };
    const result = makeAgent(undefined, feedback).template(baseLead, {
      styles: [
        { style: 'question', totalSent: 40, responseRatePercent: 20 },
        { style: 'context', totalSent: 30, responseRatePercent: 45 },
        { style: 'statement', totalSent: 35, responseRatePercent: 10 },
      ],
      bestStyle: { style: 'context', totalSent: 30, responseRatePercent: 45 },
      insufficientSample: false,
    });
    expect(result.openingStyle).toBe('context');
    expect(result.text).toContain('me chamou atenção');
  });

  it('falls back to the niche template when the LLM output has markdown/links', async () => {
    const llm = {
      executeWithFallback: jest.fn().mockResolvedValue({
        reply: '**Olá!** Confira: https://exemplo.com/promo',
        providerUsed: 'groq',
      }),
    };
    const result = await makeAgent(llm).generate(baseLead, qualification);
    expect(result.source).toBe('template'); // sanitized text too short -> template
  });

  it('template is niche-specific and names the lead', () => {
    const result = makeAgent().template(baseLead);
    expect(result.source).toBe('template');
    expect(result.text).toContain('Maria');
    expect(result.text).toContain('ouro');
    expect(result.text.length).toBeLessThanOrEqual(600);
    expect(result.text).not.toMatch(/\*\*|https?:\/\//);
  });

  it('every template fallback ends with a question (Regra de Ouro)', () => {
    const agent = makeAgent();
    for (const style of ['question', 'context', 'statement', 'direct_offer'] as const) {
      const result = agent.template(baseLead, undefined, style);
      expect(result.text.trimEnd().endsWith('?')).toBe(true);
      expect(result.openingStyle).toBe(style);
    }
  });

  it('rejects LLM output that ends in silence (Regra 7) and falls back to template', async () => {
    const llm = {
      executeWithFallback: jest.fn().mockResolvedValue({
        reply:
          'Oi Maria! tudo bem? Vi que a Joalheria Teste trabalha com compra de ouro e hoje vende bastante semijoia.',
        providerUsed: 'groq',
      }),
    };
    const result = await makeAgent(llm).generate(baseLead, qualification);
    expect(result.source).toBe('template');
    expect(result.text.trimEnd().endsWith('?')).toBe(true);
  });

  it('rejects LLM output with collection phrasing (Regra 5) and falls back to template', async () => {
    const llm = {
      executeWithFallback: jest.fn().mockResolvedValue({
        reply: 'Oi Maria! Tô aguardando sua resposta sobre a Joalheria Teste. Você vai me responder hoje?',
        providerUsed: 'groq',
      }),
    };
    const result = await makeAgent(llm).generate(baseLead, qualification);
    expect(result.source).toBe('template');
  });

  it('follow-up prompt carries the no-collection rule and last-touch context', async () => {
    const llm = {
      executeWithFallback: jest.fn().mockResolvedValue({
        reply:
          'Oi Maria! Passamos por aqui semana passada e agora tem novidade na compra de ouro. Faz sentido te contar?',
        providerUsed: 'groq',
      }),
    };
    const leadWithTouches: AgentLeadInput = {
      ...baseLead,
      previousTouches: ['Toque 1 enviado pela régua de cadência'],
    };
    await makeAgent(llm).generate(leadWithTouches, qualification);
    const firstCall = (llm.executeWithFallback.mock.calls as unknown as Array<[unknown[]]>)[0];
    const systemPrompt = (firstCall[0][0] as { content: string }).content;
    const userContext = (firstCall[0][1] as { content: string }).content;
    expect(systemPrompt).toContain('NÃO é o primeiro contato');
    expect(systemPrompt).toContain('PROIBIDO cobrar resposta');
    expect(userContext).toContain('Toque 1 enviado pela régua de cadência');
  });

  it('sanitize strips markdown, lists and links', () => {
    const agent = makeAgent();
    const cleaned = agent.sanitize('**Olá** Maria!\n- item 1\n- item 2\nVeja https://x.com/pronto');
    expect(cleaned).not.toMatch(/\*\*|^-\s|https?:\/\//m);
    expect(cleaned).toContain('Maria!');
  });

  it('sanitize caps length at 600 chars on a paragraph boundary', () => {
    const agent = makeAgent();
    const long = Array.from({ length: 50 }, (_, i) => `Parágrafo ${i} com texto suficiente.`).join('\n\n');
    expect(agent.sanitize(long).length).toBeLessThanOrEqual(600);
  });
});
