import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SessionModule } from '../session/session.module';
import { SessionRestrictionStore } from '../session/session-restriction-store.service';
import { AiFeedbackLoopService } from '../ai-agent/ai-feedback-loop.service';
import { setOpeningStyleMetricReader } from './agents-metrics';
import { AgentsAlertsService } from './agents-alerts.service';
import { AgentsSchedulerService } from './agents-scheduler.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AiAgentsController } from './ai-agents.controller';
import { LeadQualificationAgent } from './lead-qualification.agent';
import { LeadResponderAgent } from './lead-responder.agent';
import { LeadResponderInboundService } from './lead-responder-inbound.service';
import { MessageGenerationAgent } from './message-generation.agent';
import { SafetyGuardrailsAgent } from './safety-guardrails.agent';

@Module({
  imports: [SessionModule],
  controllers: [AiAgentsController],
  providers: [
    AgentOrchestratorService,
    LeadQualificationAgent,
    MessageGenerationAgent,
    SafetyGuardrailsAgent,
    LeadResponderAgent,
    LeadResponderInboundService,
    AgentsAlertsService,
    AgentsSchedulerService,
  ],
  exports: [AgentOrchestratorService, SafetyGuardrailsAgent, LeadResponderInboundService],
})
export class AiAgentsModule implements OnApplicationBootstrap {
  constructor(
    private readonly safety: SafetyGuardrailsAgent,
    private readonly restrictions: SessionRestrictionStore,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Wire cross-module readers into the agents (read-only dependencies, kept one-way). */
  onApplicationBootstrap(): void {
    this.safety.setRestrictionReader(this.restrictions);

    // Opening-style response rates -> Prometheus. The reader adapts the feedback loop's
    // per-persona report into the metric rows (one row per style x persona).
    try {
      const feedback = this.moduleRef.get(AiFeedbackLoopService, { strict: false });
      setOpeningStyleMetricReader({
        getStylePerformance: async () => {
          const report = await feedback.getOpeningStylePerformanceReport();
          return report.map(row => ({
            openingStyle: row.openingStyle as string,
            totalSent: row.totalSent,
            responseRatePercent: row.responseRatePercent,
            personaId: 'all',
          }));
        },
      });
    } catch {
      // Feedback loop absent (standalone construction): style metrics stay absent too.
    }
  }
}
