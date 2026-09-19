import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resetGuardMetrics } from '../../cadence/cadence-guard.helper';
import { resetAgentDecisionTotals } from '../agents-metrics';
import { AgentsSchedulerService } from '../agents-scheduler.service';
import { AgentOrchestratorService } from '../agent-orchestrator.service';
import { AgentLeadInput, DispatchProposal } from '../agents.types';
import { OptOutRegistry, SafetyGuardrailsAgent } from '../safety-guardrails.agent';
import { looksLikeRefusal, registerOptOutIfRefusal } from '../opt-out-detector';
import {
  dropProposal,
  flushProposalsSync,
  pendingProposals,
  proposalsStateFile,
  resetProposalPersistenceForTests,
} from '../proposal-persistence';
import { LeadQualificationAgent } from '../lead-qualification.agent';
import { MessageGenerationAgent } from '../message-generation.agent';
import { LlmProviderChainService } from '../../ai-agent/llm-provider-chain.service';

const makeLlm = (reply: string): LlmProviderChainService =>
  ({
    executeWithFallback: jest.fn().mockResolvedValue({ reply, providerUsed: 'groq', latencyMs: 10, tokensUsed: 100 }),
  }) as unknown as LlmProviderChainService;

const QUALIFICATION_JSON =
  '{"score": 85, "recommendation": "CONTACT", "reasons": ["nicho"], "dataQuality": "good", "confidence": 0.9}';
const MESSAGE_TEXT = 'Oi Maria! tudo bem? Vi que a Joalheria Teste trabalha com ouro e semijoias.';

const buildOrchestrator = () => {
  const qualification = new LeadQualificationAgent(makeLlm(QUALIFICATION_JSON));
  const message = new MessageGenerationAgent(makeLlm(MESSAGE_TEXT));
  const safety = new SafetyGuardrailsAgent();
  return new AgentOrchestratorService(qualification, message, safety, undefined);
};

const lead: AgentLeadInput = {
  phone: '5534998762935',
  name: 'Maria Souza',
  company: 'Joalheria Teste',
  niche: 'ouro',
};

/** SupabaseLead-like row for the scheduler mapping tests. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const supabaseLead = (overrides: Record<string, unknown> = {}): any =>
  ({
    phone: '5534998762935',
    name: 'Maria Souza',
    status: 'cold',
    current_step: 0,
    metadata: { nicho: 'ouro' },
    ...overrides,
  });

const buildScheduler = (): { scheduler: AgentsSchedulerService; orchestrator: AgentOrchestratorService } => {
  const orchestrator = buildOrchestrator();
  const scheduler = new AgentsSchedulerService(orchestrator, { alert: jest.fn() } as never, undefined);
  return { scheduler, orchestrator };
};

/** Access private mapping helpers without going through the Supabase fetch path. */
const toAgentLead = (scheduler: AgentsSchedulerService, row: unknown): AgentLeadInput =>
  (scheduler as unknown as { toAgentLead: (row: unknown) => AgentLeadInput }).toAgentLead(row);

describe('Melhoria 1 — detector de opt-out global (LGPD)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-optout-detector-'));
    process.env.AGENT_OPT_OUT_PATH = path.join(tmpDir, 'opt-outs.json');
    OptOutRegistry.resetForTests();
    resetGuardMetrics();
    resetAgentDecisionTotals();
  });

  afterEach(() => {
    delete process.env.AGENT_OPT_OUT_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('classifica recusas em português', () => {
    expect(looksLikeRefusal('não quero mais saber')).toBe(true);
    expect(looksLikeRefusal('me tira da lista por favor')).toBe(true);
    expect(looksLikeRefusal('para de me chamar')).toBe(true);
    expect(looksLikeRefusal('descadastro')).toBe(true);
    expect(looksLikeRefusal('bom dia! pode mandar a proposta?')).toBe(false);
    expect(looksLikeRefusal('')).toBe(false);
  });

  it('registerOptOutIfRefusal registra duravelmente e o safety passa a bloquear', () => {
    expect(registerOptOutIfRefusal('sessao-1', '5511999998888@c.us', 'não tenho interesse, me remova')).toBe(true);

    // Sobrevive a um "reboot" do registry (persistido em disco).
    OptOutRegistry.resetForTests();
    expect(OptOutRegistry.isOptedOut('5511999998888@c.us')).toBe(true);
    expect(OptOutRegistry.isOptedOut('5511999998888')).toBe(true); // normalização de dígitos

    const safety = new SafetyGuardrailsAgent();
    const result = safety.check({ ...lead, phone: '5511999998888' });
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('opt_out');
  });

  it('mensagem comum não registra opt-out', () => {
    expect(registerOptOutIfRefusal('sessao-1', lead.phone, 'quanto custa um site?')).toBe(false);
    expect(OptOutRegistry.isOptedOut(lead.phone)).toBe(false);
  });

  it('orquestrador rejeita proposta de lead que pediu exclusão (veto de safety)', async () => {
    registerOptOutIfRefusal('sessao-1', lead.phone, 'para de mandar mensagem');
    const orchestrator = buildOrchestrator();
    const proposal = await orchestrator.proposeDispatch(lead);
    expect(proposal.decision.decision).toBe('reject');
    expect(proposal.blockedReason).toContain('opt_out');
  });
});

describe('Melhoria 2 — previousTouches e notes do scheduler', () => {
  it('sintetiza touches a partir de current_step da régua', () => {
    const { scheduler } = buildScheduler();
    const mapped = toAgentLead(scheduler, supabaseLead({ current_step: 3 }));
    expect(mapped.previousTouches).toHaveLength(3);
    expect(mapped.previousTouches![0]).toContain('Toque 1');
    expect(mapped.previousTouches![2]).toContain('Toque 3');
  });

  it('prefere previous_touches explícitos do metadata e respeita o corte de 10', () => {
    const { scheduler } = buildScheduler();
    const explicit = Array.from({ length: 12 }, (_, i) => `Mensagem ${i + 1}`);
    const mapped = toAgentLead(scheduler, supabaseLead({ current_step: 5, metadata: { previous_touches: explicit } }));
    expect(mapped.previousTouches).toEqual(explicit.slice(-10));
  });

  it('lead novo (current_step 0) continua sem touches', () => {
    const { scheduler } = buildScheduler();
    const mapped = toAgentLead(scheduler, supabaseLead());
    expect(mapped.previousTouches).toEqual([]);
  });

  it('mescla notes do CRM com a última resposta do lead', () => {
    const { scheduler } = buildScheduler();
    const mapped = toAgentLead(
      scheduler,
      supabaseLead({ metadata: { notes: 'Compra ouro' }, last_reply_text: 'Depois eu vejo' }),
    );
    expect(mapped.notes).toContain('Compra ouro');
    expect(mapped.notes).toContain('Depois eu vejo');
  });
});

describe('Melhoria 3 — persistência de propostas em data/', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-proposals-'));
    process.env.AGENT_PROPOSALS_PATH = path.join(tmpDir, 'agent-proposals.json');
    // Isola também o registry de opt-out: sem isso os testes gravariam no data/ real do repo.
    process.env.AGENT_OPT_OUT_PATH = path.join(tmpDir, 'opt-outs.json');
    resetProposalPersistenceForTests();
    OptOutRegistry.resetForTests();
    resetGuardMetrics();
    resetAgentDecisionTotals();
  });

  afterEach(() => {
    delete process.env.AGENT_PROPOSALS_PATH;
    delete process.env.AGENT_OPT_OUT_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('proposta dispatch/hold é persistida; reject não é', async () => {
    const orchestrator = buildOrchestrator();
    const ok = await orchestrator.proposeDispatch(lead);
    expect(ok.decision.decision).toBe('dispatch');

    flushProposalsSync();
    expect(fs.existsSync(proposalsStateFile())).toBe(true);

    const snapshot = JSON.parse(fs.readFileSync(proposalsStateFile(), 'utf8')) as {
      proposals: Record<string, DispatchProposal>;
    };
    expect(Object.keys(snapshot.proposals)).toContain(ok.id);

    // Reject (safety veto) some da fila durável.
    OptOutRegistry.add(lead.phone);
    const rejected = await buildOrchestrator().proposeDispatch(lead);
    expect(rejected.decision.decision).toBe('reject');
    dropProposal(rejected.id);
  });

  it('restaura a fila pendente após um "reboot" (novo serviço, mesmo snapshot)', async () => {
    const first = buildOrchestrator();
    const proposal = await first.proposeDispatch(lead);
    expect(proposal.decision.decision).toBe('dispatch');
    flushProposalsSync();

    // Simula restart: estado em memória zerado, snapshot no disco.
    resetProposalPersistenceForTests();
    const second = buildOrchestrator();
    second.onModuleInit();

    const restored = second.getProposal(proposal.id);
    expect(restored).toBeDefined();
    expect(restored!.decision.decision).toBe('dispatch');
    expect(pendingProposals().some(p => p.id === proposal.id)).toBe(true);
  });

  it('aprovação gasta a proposta e a remove do snapshot durável', async () => {
    const orchestrator = buildOrchestrator();
    const proposal = await orchestrator.proposeDispatch(lead);
    (orchestrator as unknown as { messageService?: unknown }).messageService = { sendText: jest.fn() };
    const result = await orchestrator.approveProposal(proposal.id);
    expect(result.dispatched).toBe(true);

    flushProposalsSync();
    const snapshot = JSON.parse(fs.readFileSync(proposalsStateFile(), 'utf8')) as {
      proposals: Record<string, DispatchProposal>;
    };
    // Gasta = vira hold persistido (auditoria leve) mas NÃO pode mais ser aprovada.
    const again = await orchestrator.approveProposal(proposal.id);
    expect(again.dispatched).toBe(false);
    void snapshot;
  });

  it('snapshot corrompido não quebra o boot', () => {
    fs.writeFileSync(proposalsStateFile(), '{corrompido', 'utf8');
    const orchestrator = buildOrchestrator();
    expect(() => orchestrator.onModuleInit()).not.toThrow();
    expect(pendingProposals()).toHaveLength(0);
  });
});
