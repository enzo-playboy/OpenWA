import { CadenceLifecycleService, RepliedPausedOutcome } from '../cadence-lifecycle.service';
import { CadenceTimeoutJob } from '../cadence-timeout.job';
import { LeadCadenceProgress } from '../entities/lead-cadence-progress.entity';

describe('CadenceLifecycleService & TimeoutJob (Priority 1 - Lead Lifecycle Machine)', () => {
  let lifecycleService: CadenceLifecycleService;
  let timeoutJob: CadenceTimeoutJob;
  let mockLeadProgressRepo: any;
  let mockCadenceEngine: any;
  let mockEventEmitter: any;

  let leadRecord: LeadCadenceProgress;

  beforeEach(() => {
    leadRecord = {
      id: 'lead-uuid-101',
      cadenceId: 'cadence-ouro-v1',
      sessionId: 'chip-2-iphone',
      phone: '5511999998888@c.us',
      leadName: 'Joalheria Ouro Fino',
      variables: { nicho: 'Ouro & Semijoias' },
      currentStep: 2,
      status: 'replied_paused',
      reengageCycles: 0,
      lastOutcomeReason: null,
      nextRunAt: null,
      lastSentAt: new Date(Date.now() - 3600_000 * 5),
      lastReplyAt: new Date(Date.now() - 3600_000 * 25), // 25 hours ago
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    mockLeadProgressRepo = {
      findOne: jest.fn().mockImplementation(async ({ where }) => {
        return leadRecord;
      }),
      find: jest.fn().mockImplementation(async () => [leadRecord]),
      save: jest.fn().mockImplementation(async (item: any) => item),
    };

    mockCadenceEngine = {
      switchCadence: jest.fn().mockResolvedValue(leadRecord),
      resumeFromLastStep: jest.fn().mockResolvedValue(leadRecord),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    lifecycleService = new CadenceLifecycleService(mockLeadProgressRepo, mockCadenceEngine, mockEventEmitter);

    timeoutJob = new CadenceTimeoutJob(mockLeadProgressRepo, lifecycleService);
  });

  it('1. should move lead to nurture when AI classifies "not_now"', async () => {
    const result = await lifecycleService.resolveRepliedPaused('5511999998888@c.us', 'nurture', {
      summary: 'Lead informou não ter interesse no momento (not_now)',
    });

    expect(result).toBeDefined();
    expect(result?.status).toBe('nurture_cadence');
    expect(mockCadenceEngine.switchCadence).toHaveBeenCalledWith('lead-uuid-101', 'nurture-sequence');
  });

  it('2. should emit handoff.requested when AI detects complaint / needs_human', async () => {
    const result = await lifecycleService.resolveRepliedPaused('5511999998888@c.us', 'manual_handoff', {
      summary: 'Lead solicitou atendimento humano explícito',
      aiConfidence: 0.9,
      agentNotes: 'Lead deseja negociar lote enterprise em ouro',
    });

    expect(result).toBeDefined();
    expect(result?.status).toBe('manual_handoff');
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'handoff.requested',
      expect.objectContaining({
        leadId: 'lead-uuid-101',
        phone: '5511999998888@c.us',
        priority: 'high',
      }),
    );
  });

  it('3. should resume cadence after timeout with contextual message', async () => {
    const result = await lifecycleService.resolveRepliedPaused('5511999998888@c.us', 'timeout_reengage', {
      summary: 'Lead parou de responder após 24h',
      reengageContext: 'Vi que a gente não conseguiu conversar mais cedo — sem problemas!',
    });

    expect(result).toBeDefined();
    expect(result?.status).toBe('reengaged');
    expect(result?.reengageCycles).toBe(1);
    expect(mockCadenceEngine.resumeFromLastStep).toHaveBeenCalledWith(
      'lead-uuid-101',
      'Vi que a gente não conseguiu conversar mais cedo — sem problemas!',
    );
  });

  it('4. should NOT reengage if lead status is not replied_paused (race condition guard)', async () => {
    leadRecord.status = 'active'; // Status changed concurrently

    const result = await lifecycleService.resolveRepliedPaused('5511999998888@c.us', 'timeout_reengage', {
      summary: 'Timeout triggered',
    });

    expect(result).toBeNull();
    expect(mockCadenceEngine.resumeFromLastStep).not.toHaveBeenCalled();
  });

  it('5. should protect against infinite loops (maxReengageCycles: 2) by diverting to nurture', async () => {
    leadRecord.reengageCycles = 2; // Reached max allowed cycles!

    const result = await lifecycleService.resolveRepliedPaused('5511999998888@c.us', 'timeout_reengage', {
      summary: 'Timeout triggered for 3rd time',
    });

    expect(result).toBeDefined();
    expect(result?.status).toBe('nurture_cadence');
    expect(result?.lastOutcomeReason).toContain('Max reengage cycles reached (2/2)');
    expect(mockCadenceEngine.switchCadence).toHaveBeenCalledWith('lead-uuid-101', 'nurture-sequence');
  });

  it('6. CadenceTimeoutJob should process timed out leads successfully', async () => {
    const jobResult = await timeoutJob.handleReengageTimeouts();

    expect(jobResult.processedCount).toBe(1);
    expect(jobResult.processedLeads).toContain('5511999998888@c.us');
    expect(mockCadenceEngine.resumeFromLastStep).toHaveBeenCalled();
  });
});
