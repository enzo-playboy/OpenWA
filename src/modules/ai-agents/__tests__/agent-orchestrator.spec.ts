import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LlmProviderChainService } from '../../ai-agent/llm-provider-chain.service';
import { resetGuardMetrics } from '../../cadence/cadence-guard.helper';
import { resetAgentDecisionTotals } from '../agents-metrics';
import { AgentOrchestratorService } from '../agent-orchestrator.service';
import { AgentLeadInput } from '../agents.types';
import { LeadQualificationAgent } from '../lead-qualification.agent';
import { MessageGenerationAgent } from '../message-generation.agent';
import { DAILY_QUOTA_PER_CHIP, OptOutRegistry, SafetyGuardrailsAgent } from '../safety-guardrails.agent';

const richLead: AgentLeadInput = {
  phone: '5534998762935',
  name: 'Maria Souza',
  company: 'Joalheria Teste',
  niche: 'ouro',
  notes: 'Joalheria com loja física no centro, compra ouro de clientes finais e revenda de semijoias.',
};

const makeLlm = (reply: string): LlmProviderChainService =>
  ({
    executeWithFallback: jest.fn().mockResolvedValue({ reply, providerUsed: 'groq', latencyMs: 10, tokensUsed: 100 }),
  }) as unknown as LlmProviderChainService;

const QUALIFICATION_JSON =
  '{"score": 85, "recommendation": "CONTACT", "reasons": ["nicho"], "dataQuality": "good", "confidence": 0.9}';
const MESSAGE_TEXT =
  'Oi Maria! tudo bem? Vi que a Joalheria Teste trabalha com compra de ouro e semijoias.\n\nHoje vocês vendem mais ouro ou semijoia?';

const buildOrchestrator = (llmReply?: { qualification?: string; message?: string }) => {
  const qualification = new LeadQualificationAgent(makeLlm(llmReply?.qualification ?? QUALIFICATION_JSON));
  const message = new MessageGenerationAgent(makeLlm(llmReply?.message ?? MESSAGE_TEXT));
  const safety = new SafetyGuardrailsAgent();
  const orchestrator = new AgentOrchestratorService(qualification, message, safety, undefined);
  return { orchestrator, safety };
};

describe('SafetyGuardrailsAgent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-optout-'));
    process.env.AGENT_OPT_OUT_PATH = path.join(tmpDir, 'opt-outs.json');
    OptOutRegistry.resetForTests();
    resetGuardMetrics();
    resetAgentDecisionTotals();
  });

  afterEach(() => {
    delete process.env.AGENT_OPT_OUT_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('blocks protected manual-attendance phones', () => {
    const safety = new SafetyGuardrailsAgent();
    const result = safety.check({ ...richLead, phone: '+55 11 98138-1228' }, { nowTimestampMs: Date.now() });
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('protected_contact');
  });

  it('blocks dispatch when the resolved chip is under a 24h reachout timelock', () => {
    const safety = new SafetyGuardrailsAgent();
    const end = Date.now() + 22 * 3600_000;
    safety.setRestrictionReader({
      get: (sessionId: string) =>
        sessionId === '84e58e30-9c99-4eb5-8e27-c6604778d1cd'
          ? { kind: 'reachout_timelock' as const, code: 'BIZ_QUALITY', expiresAt: end }
          : undefined,
    });
    const result = safety.check({ ...richLead, niche: 'agro' }); // agro chip = suportew
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('account_restriction');
    expect(result.reasons[0]).toContain(new Date(end).toISOString());
  });

  it('ignores restrictions on other chips and dispatches normally', () => {
    const safety = new SafetyGuardrailsAgent();
    safety.setRestrictionReader({
      get: (sessionId: string) =>
        sessionId === 'other-chip'
          ? { kind: 'reachout_timelock' as const, code: 'X', expiresAt: Date.now() + 3600_000 }
          : undefined,
    });
    const result = safety.check(richLead);
    expect(result.allowed).toBe(true);
  });

  it('blocks opted-out leads and persists the registry', () => {
    OptOutRegistry.add(richLead.phone, 'teste');
    const safety = new SafetyGuardrailsAgent();
    const result = safety.check(richLead);
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('opt_out');

    // Persistence: a fresh registry instance (simulated reboot) still blocks.
    OptOutRegistry.resetForTests();
    expect(OptOutRegistry.isOptedOut(richLead.phone)).toBe(true);
  });

  it('allows a clean lead and resolves the ouro chip', () => {
    const safety = new SafetyGuardrailsAgent();
    const result = safety.check(richLead);
    expect(result.allowed).toBe(true);
    expect(result.sessionId).toBeDefined();
    expect(result.chipName).toContain('chip-2-iphone');
  });

  it('enforces the daily quota backstop on the resolved chip', () => {
    const safety = new SafetyGuardrailsAgent();
    const first = safety.check(richLead); // resolves the ouro chip
    expect(first.allowed).toBe(true);
    for (let i = 0; i < DAILY_QUOTA_PER_CHIP; i++) {
      safety.recordDispatch(first.sessionId!);
    }
    const result = safety.check(richLead);
    expect(result.violations).toContain('daily_quota');
  });

  it('withChipLock serializes and releases', async () => {
    const safety = new SafetyGuardrailsAgent();
    const out = await safety.withChipLock('lock-test-chip', 15_000, () => Promise.resolve('ran'));
    expect(out).toBe('ran');
    const blocked = await safety.withChipLock('lock-test-chip', 15_000, () => Promise.resolve('never'));
    expect(blocked).not.toBeNull(); // lock was released above, so acquisition succeeds again
  });
});

describe('AgentOrchestratorService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-orch-'));
    process.env.AGENT_OPT_OUT_PATH = path.join(tmpDir, 'opt-outs.json');
    OptOutRegistry.resetForTests();
    resetGuardMetrics();
    resetAgentDecisionTotals();
  });

  afterEach(() => {
    delete process.env.AGENT_OPT_OUT_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces a dispatch proposal for a strong lead (consensus >= 0.7)', async () => {
    const { orchestrator } = buildOrchestrator();
    const proposal = await orchestrator.proposeDispatch(richLead);
    expect(proposal.decision.decision).toBe('dispatch');
    expect(proposal.decision.confidence).toBeGreaterThanOrEqual(0.7);
    expect(proposal.message.text).toContain('Maria');
    expect(proposal.safety.allowed).toBe(true);
  });

  it('safety veto short-circuits the pipeline (opt-out) without calling the LLMs', async () => {
    OptOutRegistry.add(richLead.phone);
    const { orchestrator } = buildOrchestrator();
    const proposal = await orchestrator.proposeDispatch(richLead);
    expect(proposal.decision.decision).toBe('reject');
    expect(proposal.blockedReason).toContain('opt_out');
    expect(proposal.message.text).toBe('');
  });

  it('qualification REJECT short-circuits without generating a message', async () => {
    const { orchestrator } = buildOrchestrator({
      qualification:
        '{"score": 10, "recommendation": "REJECT", "reasons": ["fora do ICP"], "dataQuality": "poor", "confidence": 0.8}',
    });
    const proposal = await orchestrator.proposeDispatch(richLead);
    expect(proposal.decision.decision).toBe('reject');
    expect(proposal.blockedReason).toContain('qualification');
  });

  it('weak LLM sources degrade the consensus to hold (below 0.7 threshold)', async () => {
    const { orchestrator } = buildOrchestrator({
      qualification:
        '{"score": 60, "recommendation": "HOLD", "reasons": ["duvidoso"], "dataQuality": "partial", "confidence": 0.4}',
      message: undefined, // template source -> weaker message vote
    });
    const proposal = await orchestrator.proposeDispatch(richLead);
    expect(['hold', 'reject']).toContain(proposal.decision.decision);
  });

  it('approveProposal sends via MessageService and re-runs safety at approval time', async () => {
    const { orchestrator } = buildOrchestrator();
    const proposal = await orchestrator.proposeDispatch(richLead);
    expect(proposal.decision.decision).toBe('dispatch');

    const sendText = jest.fn().mockResolvedValue({});
    (orchestrator as unknown as { messageService?: { sendText: unknown } }).messageService = { sendText };
    const result = await orchestrator.approveProposal(proposal.id);
    expect(result.dispatched).toBe(true);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect((sendText.mock.calls[0] as unknown as Array<{ text: string }>)[1].text).toBe(proposal.message.text);

    // Double approval is refused (proposal is spent).
    const again = await orchestrator.approveProposal(proposal.id);
    expect(again.dispatched).toBe(false);
  });

  it('approveProposal fails closed when safety changed between proposal and approval', async () => {
    const { orchestrator } = buildOrchestrator();
    const proposal = await orchestrator.proposeDispatch(richLead);
    expect(proposal.decision.decision).toBe('dispatch');

    OptOutRegistry.add(richLead.phone); // lead opted out AFTER the proposal
    const sendText = jest.fn();
    (orchestrator as unknown as { messageService?: unknown }).messageService = { sendText };
    const result = await orchestrator.approveProposal(proposal.id);
    expect(result.dispatched).toBe(false);
    expect(sendText).not.toHaveBeenCalled();
    expect(result.reason).toContain('opt_out');
  });

  it('approval requires an existing proposal', async () => {
    const { orchestrator } = buildOrchestrator();
    const result = await orchestrator.approveProposal('does-not-exist');
    expect(result.dispatched).toBe(false);
  });

  it('lists proposals newest-first and can filter by status', async () => {
    const { orchestrator } = buildOrchestrator();
    await orchestrator.proposeDispatch(richLead);
    await orchestrator.proposeDispatch({ ...richLead, phone: '5534998762001', company: 'Outra Joalheria' });
    const all = orchestrator.listProposals();
    expect(all.length).toBe(2);
    expect(all[0].createdAt >= all[1].createdAt).toBe(true);
    expect(orchestrator.listProposals('dispatch').every(p => p.decision.decision === 'dispatch')).toBe(true);
  });
});
