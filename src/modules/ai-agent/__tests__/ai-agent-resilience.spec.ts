import { AiAgentService } from '../ai-agent.service';
import { GroqTranscriptionService } from '../groq-transcription.service';

describe('AI Agent Resilience, Evaluator & Kill Switch E2E', () => {
  let aiAgentService: AiAgentService;
  let transcriptionService: GroqTranscriptionService;

  beforeEach(() => {
    aiAgentService = new AiAgentService({} as any, {} as any, {} as any);
    transcriptionService = new GroqTranscriptionService();
  });

  describe('Global Kill Switch', () => {
    it('deve desativar e reativar a IA globalmente em 1 clique', () => {
      expect(aiAgentService.isGlobalKillSwitchActive()).toBe(false);

      aiAgentService.toggleGlobalKillSwitch(true);
      expect(aiAgentService.isGlobalKillSwitchActive()).toBe(true);

      aiAgentService.toggleGlobalKillSwitch(false);
      expect(aiAgentService.isGlobalKillSwitchActive()).toBe(false);
    });
  });

  describe('Evaluator Anti-Clichê & Anti-Bot', () => {
    it('deve remover frases robóticas e clichês de IA pré-envio', () => {
      const roboticReply = 'Certamente! Estou à disposição para auxiliar com o seu projeto.';
      const cleaned = aiAgentService.evaluateAndCleanResponse(roboticReply);

      expect(cleaned).not.toContain('Certamente!');
      expect(cleaned).not.toContain('Estou à disposição para auxiliar');
      expect(cleaned).toContain('qualquer dúvida me avisa!');
    });

    it('deve simplificar saudações formais', () => {
      const formalReply = 'Prezado(a) cliente, como posso ajudá-lo hoje?';
      const cleaned = aiAgentService.evaluateAndCleanResponse(formalReply);

      expect(cleaned).toContain('oi!');
      expect(cleaned).toContain('como posso te ajudar?');
    });
  });

  describe('Handoff para Atendimento Humano', () => {
    it('deve detectar solicitação explícita de atendente humano', () => {
      const check = aiAgentService.shouldHandoffToHuman('Quero falar com um atendente humano por favor');
      expect(check.handoff).toBe(true);
      expect(check.reason).toContain('atendente humano');
    });

    it('deve detectar reclamações graves ou Procon', () => {
      const check = aiAgentService.shouldHandoffToHuman('Se não resolver vou acionar o Procon');
      expect(check.handoff).toBe(true);
    });

    it('deve permitir conversas normais de vendas', () => {
      const check = aiAgentService.shouldHandoffToHuman('Vocês fazem site institucional?');
      expect(check.handoff).toBe(false);
    });
  });

  describe('Transcription Service Fallback Chain', () => {
    it('deve retornar mensagem amigável em texto caso todas as APIs falhem', async () => {
      const originalGroqKey = process.env.GROQ_API_KEY;
      const originalOpenAiKey = process.env.OPENAI_API_KEY;

      process.env.GROQ_API_KEY = 'invalid_key';
      process.env.OPENAI_API_KEY = 'invalid_key';

      const mockAudioBuffer = Buffer.from('fake-audio-bytes');
      const result = await transcriptionService.transcribeAudio(mockAudioBuffer, 'audio/ogg');

      expect(result).toContain('[Áudio recebido');

      process.env.GROQ_API_KEY = originalGroqKey;
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    });
  });
});
