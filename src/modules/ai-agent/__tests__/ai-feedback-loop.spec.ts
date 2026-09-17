import { AiFeedbackLoopService } from '../ai-feedback-loop.service';
import { MessageEngagement } from '../entities/message-engagement.entity';

describe('AiFeedbackLoopService (Feedback Loop Pós-Envio & Prompt Optimization)', () => {
  let service: AiFeedbackLoopService;
  let mockEngagementRepo: any;
  let storedEngagements: MessageEngagement[];

  beforeEach(() => {
    storedEngagements = [];

    mockEngagementRepo = {
      create: jest.fn().mockImplementation((dto: Partial<MessageEngagement>) => {
        return {
          id: `eng-${Date.now()}-${Math.random()}`,
          ...dto,
        } as MessageEngagement;
      }),
      save: jest.fn().mockImplementation(async (item: MessageEngagement) => {
        const idx = storedEngagements.findIndex(e => e.id === item.id);
        if (idx >= 0) {
          storedEngagements[idx] = item;
        } else {
          storedEngagements.push(item);
        }
        return item;
      }),
      findOne: jest.fn().mockImplementation(async ({ where }) => {
        const conditions = Array.isArray(where) ? where : [where];
        return (
          storedEngagements.find(e =>
            conditions.some(c => (c.phone && e.phone === c.phone) || (c.leadId && e.leadId === c.leadId)),
          ) || null
        );
      }),
      find: jest.fn().mockImplementation(async () => [...storedEngagements]),
    };

    service = new AiFeedbackLoopService(mockEngagementRepo);
  });

  it('1. should accurately classify opening styles', () => {
    expect(service.classifyOpeningStyle('Olá! Você gostaria de ver o catálogo?')).toBe('question');
    expect(service.classifyOpeningStyle('Vi que você procurou por soluções em irrigação.')).toBe('context');
    expect(service.classifyOpeningStyle('Temos uma oferta com desconto exclusivo hoje.')).toBe('direct_offer');
    expect(service.classifyOpeningStyle('Nossa empresa atende todo o Brasil.')).toBe('statement');
  });

  it('2. should track sent message with hashed fingerprint and opening style', async () => {
    const record = await service.trackSentMessage(
      'lead-1',
      '5511988887777@c.us',
      'chip-2-iphone',
      'sdr-ouro',
      'Vi que você possui interesse em semi-jóias. Qual modelo prefere?',
    );

    expect(record).toBeDefined();
    expect(record.openingStyle).toBe('question'); // First line question / question mark
    expect(record.personaId).toBe('sdr-ouro');
    expect(record.leadReplied).toBe(false);
    expect(record.messageHash).toBeDefined();
  });

  it('3. should record lead reply, compute latency, and associate conversation outcome', async () => {
    const initialSent = await service.trackSentMessage(
      'lead-2',
      '556596466243@c.us',
      'suportew',
      'sdr-agro',
      'Tudo bem com a lavoura?',
    );

    // Simulate sent 10 minutes ago
    initialSent.sentAt = new Date(Date.now() - 10 * 60 * 1000);

    const updated = await service.recordLeadReply('556596466243@c.us', 'qualified');

    expect(updated).toBeDefined();
    expect(updated?.leadReplied).toBe(true);
    expect(updated?.replyLatencyMinutes).toBeGreaterThanOrEqual(9);
    expect(updated?.outcome).toBe('qualified');
  });

  it('4. should aggregate performance by persona and opening style', async () => {
    // Populate fake engagements for 2 personas and styles
    storedEngagements.push(
      {
        id: '1',
        leadId: 'l1',
        phone: 'p1',
        sessionId: 's1',
        personaId: 'sdr-agro',
        openingStyle: 'question',
        messageHash: 'h1',
        sentAt: new Date(),
        leadReplied: true,
        repliedAt: new Date(),
        replyLatencyMinutes: 5,
        outcome: 'qualified',
      } as MessageEngagement,
      {
        id: '2',
        leadId: 'l2',
        phone: 'p2',
        sessionId: 's1',
        personaId: 'sdr-agro',
        openingStyle: 'question',
        messageHash: 'h2',
        sentAt: new Date(),
        leadReplied: true,
        repliedAt: new Date(),
        replyLatencyMinutes: 15,
        outcome: 'qualified',
      } as MessageEngagement,
      {
        id: '3',
        leadId: 'l3',
        phone: 'p3',
        sessionId: 's1',
        personaId: 'sdr-ouro',
        openingStyle: 'statement',
        messageHash: 'h3',
        sentAt: new Date(),
        leadReplied: false,
        repliedAt: null,
        replyLatencyMinutes: null,
        outcome: null,
      } as MessageEngagement,
    );

    const personaReport = await service.getPersonaPerformanceReport();
    expect(personaReport).toHaveLength(2);

    const agroPersona = personaReport.find(p => p.personaId === 'sdr-agro');
    expect(agroPersona?.responseRatePercent).toBe(100);
    expect(agroPersona?.qualifiedCount).toBe(2);

    const styleReport = await service.getOpeningStylePerformanceReport();
    const questionStyle = styleReport.find(s => s.openingStyle === 'question');
    expect(questionStyle?.responseRatePercent).toBe(100);
  });

  it('5. should generate prompt optimization recommendations based on response patterns', async () => {
    // Add 4 questions (3 replied = 75%) and 4 statements (0 replied = 0%)
    for (let i = 0; i < 4; i++) {
      storedEngagements.push({
        id: `q-${i}`,
        leadId: `l-q-${i}`,
        phone: `p-q-${i}`,
        sessionId: 's1',
        personaId: 'sdr-prospect',
        openingStyle: 'question',
        messageHash: `hq-${i}`,
        sentAt: new Date(),
        leadReplied: i < 3,
        repliedAt: i < 3 ? new Date() : null,
        replyLatencyMinutes: i < 3 ? 10 : null,
        outcome: i < 3 ? 'qualified' : null,
      } as MessageEngagement);

      storedEngagements.push({
        id: `st-${i}`,
        leadId: `l-st-${i}`,
        phone: `p-st-${i}`,
        sessionId: 's1',
        personaId: 'sdr-cold',
        openingStyle: 'statement',
        messageHash: `hst-${i}`,
        sentAt: new Date(),
        leadReplied: false,
        repliedAt: null,
        replyLatencyMinutes: null,
        outcome: null,
      } as MessageEngagement);
    }

    const recommendations = await service.generatePromptOptimizationRecommendations();

    expect(recommendations.length).toBeGreaterThan(0);
    const styleRec = recommendations.find(r => r.type === 'style_shift');
    expect(styleRec).toBeDefined();
    expect(styleRec?.insight).toContain("estilo de abertura 'question'");
  });
});
