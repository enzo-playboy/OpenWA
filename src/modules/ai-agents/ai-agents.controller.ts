import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { SafetyGuardrailsAgent, OptOutRegistry } from './safety-guardrails.agent';
import { LeadResponderAgent } from './lead-responder.agent';
import { AGENT_AUTO_RESPOND_ENV, LeadResponderInboundService } from './lead-responder-inbound.service';
import { AgentLeadInput } from './agents.types';

@ApiTags('AI Agents (Prospecção Autônoma - FASE 1)')
@Controller('ai-agents')
export class AiAgentsController {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly safety: SafetyGuardrailsAgent,
    private readonly responder: LeadResponderAgent,
  ) {}

  @Post('propose')
  @ApiOperation({
    summary: 'Roda o pipeline de agentes para um lead e retorna uma proposta (NÃO envia nada)',
  })
  propose(
    @Body()
    body: {
      phone: string;
      name?: string;
      company?: string;
      niche: 'ouro' | 'agro';
      notes?: string;
      previousTouches?: string[];
      activeSessionIds?: string[];
    },
  ) {
    const lead: AgentLeadInput = {
      phone: body.phone,
      name: body.name,
      company: body.company,
      niche: body.niche,
      notes: body.notes,
      previousTouches: body.previousTouches,
    };
    return this.orchestrator.proposeDispatch(lead, { activeSessionIds: body.activeSessionIds });
  }

  @Get('proposals')
  @ApiOperation({ summary: 'Lista propostas pendentes de aprovação humana (mais novas primeiro)' })
  list(@Query('status') status?: 'dispatch' | 'hold' | 'reject') {
    return { proposals: this.orchestrator.listProposals(status) };
  }

  @Get('proposals/:id')
  @ApiOperation({ summary: 'Detalha uma proposta específica' })
  get(@Param('id') id: string) {
    const proposal = this.orchestrator.getProposal(id);
    return proposal ?? { error: 'proposta não encontrada' };
  }

  @Post('proposals/:id/approve')
  @ApiOperation({
    summary: 'Aprova e envia UMA proposta (gate humano; revalida safety no momento do envio)',
  })
  approve(@Param('id') id: string, @Body() body: { activeSessionIds?: string[] } = {}) {
    return this.orchestrator.approveProposal(id, { activeSessionIds: body.activeSessionIds });
  }

  @Post('opt-out')
  @ApiOperation({ summary: 'Registra pedido de exclusão de contato (LGPD art. 18, IV) — bloqueia futuras propostas' })
  optOut(@Body() body: { phone: string; reason?: string }) {
    OptOutRegistry.add(body.phone, body.reason ?? 'solicitação do titular');
    return { ok: true, phone: body.phone };
  }

  @Delete('opt-out/:phone')
  @ApiOperation({ summary: 'Remove um número do registry de opt-out (ex.: correção administrativa)' })
  removeOptOut(@Param('phone') phone: string) {
    return { removed: OptOutRegistry.remove(phone) };
  }

  @Get('quota/:sessionId')
  @ApiOperation({ summary: 'Uso atual da quota diária do chip' })
  quota(@Param('sessionId') sessionId: string) {
    return { sessionId, usedToday: this.safety.quotaUsedToday(sessionId), dailyLimit: 40 };
  }

  @Get('conversations/:phone')
  @ApiOperation({ summary: 'Histórico da conversa do responder agent com um lead' })
  conversation(@Param('phone') phone: string, @Query('limit') limit?: string) {
    return { turns: this.responder.getHistory(phone, limit ? Number(limit) : 20) };
  }

  @Post('conversations/:phone/human-takeover')
  @ApiOperation({ summary: 'Humano assume a conversa: agente e Sofia saem, sem dupla resposta' })
  humanTakeover(@Param('phone') phone: string) {
    this.responder.markHumanTakeover(phone);
    LeadResponderInboundService.clearAgentHandled(phone.includes('@') ? phone : `${phone}@c.us`);
    return { ok: true, phone };
  }

  @Get('auto-respond/status')
  @ApiOperation({ summary: 'Estado do auto-responder (AGENT_AUTO_RESPOND)' })
  autoRespondStatus() {
    return { enabled: process.env[AGENT_AUTO_RESPOND_ENV] === 'true' };
  }
}
