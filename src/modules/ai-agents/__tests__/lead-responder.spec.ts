import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LlmProviderChainService } from '../../ai-agent/llm-provider-chain.service';
import { AgentsAlertsService } from '../agents-alerts.service';
import { LeadResponderAgent } from '../lead-responder.agent';
import { LeadResponderInboundService } from '../lead-responder-inbound.service';

const noopAlerts = { alert: jest.fn() } as unknown as AgentsAlertsService;

const makeResponder = (llmReply?: string | Error): LeadResponderAgent =>
  new LeadResponderAgent({
    executeWithFallback: llmReply
      ? llmReply instanceof Error
        ? jest.fn().mockRejectedValue(llmReply)
        : jest.fn().mockResolvedValue({ reply: llmReply, providerUsed: 'groq' })
      : jest.fn(),
  } as unknown as LlmProviderChainService);

describe('LeadResponderAgent (intents)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'responder-'));
    process.env.AGENT_OPT_OUT_PATH = path.join(tmpDir, 'opt-outs.json');
  });

  afterEach(() => {
    delete process.env.AGENT_OPT_OUT_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refusal triggers automatic opt-out and a goodbye (rules, no LLM)', async () => {
    const llm = { executeWithFallback: jest.fn() };
    const responder = new LeadResponderAgent(llm as unknown as LlmProviderChainService);
    const decision = await responder.handleLeadMessage('5534999', 'não quero mais contato, me remove aí');
    expect(decision.action).toBe('opt_out');
    expect(decision.intent).toBe('refuse');
    expect(decision.source).toBe('rules');
    expect(llm.executeWithFallback).not.toHaveBeenCalled();
  });

  it('refusal variants are caught (LGPD-critical path)', async () => {
    const responder = makeResponder('ok');
    for (const text of ['Me tira da lista', 'PARA DE ME CHAMAR', 'descadastro por favor', 'não me envie nada']) {
      const d = await responder.handleLeadMessage('5534998', text);
      expect(d.action).toBe('opt_out');
    }
  });

  it('explicit human request escalates without an auto reply', async () => {
    const responder = makeResponder('oi!');
    const d = await responder.handleLeadMessage('5534997', 'quero falar com um atendente humano');
    expect(d.action).toBe('escalate');
    expect(d.reply).toBeNull();
  });

  it('LLM reply is sent for a normal interested message', async () => {
    const responder = makeResponder('Oi! Que bom te ouvir. Como funciona hoje aí?');
    const d = await responder.handleLeadMessage('5534996', 'sim, pode me contar mais?', { niche: 'ouro' });
    expect(d.action).toBe('reply');
    expect(d.reply).not.toContain('*');
    expect(d.source).toBe('llm');
  });

  it('LLM failure falls back to escalate (fail closed, never guesses)', async () => {
    const responder = makeResponder(new Error('all providers down'));
    const d = await responder.handleLeadMessage('5534995', 'hm, interessante');
    expect(d.action).toBe('escalate');
    expect(d.source).toBe('rules');
    expect(d.confidence).toBeLessThan(0.5);
  });

  it('conversation memory keeps turns for context', async () => {
    const responder = makeResponder('blz, te explico!');
    await responder.handleLeadMessage('5534994', 'oi');
    await responder.handleLeadMessage('5534994', 'tudo bem?');
    const history = responder.getHistory('5534994');
    // Each handled message records the lead turn; LLM replies also record an agent turn.
    expect(history.filter(t => t.role === 'lead').length).toBe(2);
    expect(history.length).toBeGreaterThanOrEqual(3);
  });

  it('sanitize strips markdown and links', async () => {
    const responder = makeResponder('**Olá!** veja https://x.com');
    const d = await responder.handleLeadMessage('5534993', 'oi, pode falar?');
    expect(d.reply ?? '').not.toMatch(/\*\*|https?:\/\//);
  });
});

describe('LeadResponderInboundService (anti double-reply)', () => {
  it('skips everything when AGENT_AUTO_RESPOND is off', async () => {
    delete process.env.AGENT_AUTO_RESPOND;
    const responder = { handleLeadMessage: jest.fn() };
    const svc = new LeadResponderInboundService(responder as unknown as LeadResponderAgent, noopAlerts);
    await svc.handleInbound('sess', '5534992@c.us', 'oi');
    expect(responder.handleLeadMessage).not.toHaveBeenCalled();
  });

  it('only reacts to chats the pipeline started (agent-handled)', async () => {
    process.env.AGENT_AUTO_RESPOND = 'true';
    const responder = {
      handleLeadMessage: jest
        .fn()
        .mockResolvedValue({ action: 'reply', reply: 'ok', intent: 'interested', confidence: 0.9, source: 'llm' }),
    };
    const send = jest.fn();
    const svc = new LeadResponderInboundService(responder as unknown as LeadResponderAgent, noopAlerts, {
      get: () => ({ sendText: send }),
    } as unknown as ModuleRefLike);
    try {
      // Not agent-handled yet: nothing happens.
      await svc.handleInbound('sess', '5534991@c.us', 'oi');
      expect(responder.handleLeadMessage).not.toHaveBeenCalled();

      LeadResponderInboundService.markAgentHandled('5534991@c.us');
      await svc.handleInbound('sess', '5534991@c.us', 'oi');
      expect(responder.handleLeadMessage).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      LeadResponderInboundService.clearAgentHandled('5534991@c.us');
      delete process.env.AGENT_AUTO_RESPOND;
    }
  });

  it('escalation clears the agent-handled state (Sofia/operator regain the chat)', async () => {
    process.env.AGENT_AUTO_RESPOND = 'true';
    const responder = {
      handleLeadMessage: jest
        .fn()
        .mockResolvedValue({ action: 'escalate', reply: null, intent: 'handoff', confidence: 1, source: 'rules' }),
    };
    const send = jest.fn();
    const svc = new LeadResponderInboundService(responder as unknown as LeadResponderAgent, noopAlerts, {
      get: () => ({ sendText: send }),
    } as unknown as ModuleRefLike);
    try {
      LeadResponderInboundService.markAgentHandled('5534990@c.us');
      await svc.handleInbound('sess', '5534990@c.us', 'quero falar com atendente');
      expect(send).not.toHaveBeenCalled();
      expect(LeadResponderInboundService.isAgentHandled('5534990@c.us')).toBe(false);
    } finally {
      LeadResponderInboundService.clearAgentHandled('5534990@c.us');
      delete process.env.AGENT_AUTO_RESPOND;
    }
  });
});

interface ModuleRefLike {
  get(): unknown;
}
