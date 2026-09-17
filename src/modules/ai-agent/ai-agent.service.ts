import { Injectable, OnModuleInit, Optional, Inject, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { AiKnowledge } from './entities/ai-knowledge.entity';
import { AiLog } from './entities/ai-log.entity';
import { Message } from '../message/entities/message.entity';
import { createLogger } from '../../common/services/logger.service';
import { MessageService } from '../message/message.service';
import { GroqTranscriptionService } from './groq-transcription.service';
import { LlmProviderChainService } from './llm-provider-chain.service';
import { InstagramService } from '../instagram/instagram.service';

export interface ChatMessageContext {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly logger = createLogger('AiAgentService');
  private messageService?: MessageService;

  constructor(
    @InjectRepository(AiAgentConfig, 'data')
    private readonly configRepo: Repository<AiAgentConfig>,
    @InjectRepository(AiKnowledge, 'data')
    private readonly knowledgeRepo: Repository<AiKnowledge>,
    @InjectRepository(AiLog, 'data')
    private readonly logRepo: Repository<AiLog>,
    @Optional()
    @InjectRepository(Message, 'data')
    private readonly messageRepo?: Repository<Message>,
    private readonly configService?: ConfigService,
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() private readonly groqTranscriptionService?: GroqTranscriptionService,
    @Optional() private readonly llmProviderChain?: LlmProviderChainService,
    @Optional()
    @Inject(forwardRef(() => InstagramService))
    private readonly instagramService?: InstagramService,
  ) {}

  onModuleInit() {
    this.logger.log('AI Agent Service initialized.');
  }

  private getMessageService(): MessageService | undefined {
    if (!this.messageService && this.moduleRef) {
      this.messageService = this.moduleRef.get(MessageService, { strict: false });
    }
    return this.messageService;
  }

  private readonly messageBuffers = new Map<string, { timer: NodeJS.Timeout; messages: string[] }>();
  private readonly pausedChats = new Set<string>();
  private globalKillSwitchActive = false;

  toggleGlobalKillSwitch(active?: boolean): { globalKillSwitchActive: boolean } {
    this.globalKillSwitchActive = active !== undefined ? active : !this.globalKillSwitchActive;
    this.logger.warn(
      `[ Sofia AI Kill Switch ] Global AI Auto-reply set to: ${this.globalKillSwitchActive ? 'DISABLED (OFF)' : 'ACTIVE (ON)'}`,
    );
    return { globalKillSwitchActive: this.globalKillSwitchActive };
  }

  isGlobalKillSwitchActive(): boolean {
    return this.globalKillSwitchActive;
  }

  /**
   * Evaluator Anti-Clichê & Anti-Bot: limpa frases robóticas antes do envio.
   */
  evaluateAndCleanResponse(reply: string): string {
    if (!reply) return reply;

    let cleaned = reply;
    const clicheReplacements: [RegExp, string][] = [
      [/^certamente[!,.]?\s*/i, ''],
      [/estou à disposição para auxiliar/gi, 'qualquer dúvida me avisa!'],
      [/como posso ajudá-lo hoje\??/gi, 'como posso te ajudar?'],
      [/prezado\(a\)\s+cliente/gi, 'oi!'],
      [/com certeza[!,.]?\s*/i, ''],
    ];

    for (const [regex, replacement] of clicheReplacements) {
      cleaned = cleaned.replace(regex, replacement);
    }

    return cleaned.trim();
  }

  /**
   * Detecta se a mensagem exige transferência para um atendente humano.
   */
  shouldHandoffToHuman(userMessage: string): { handoff: boolean; reason?: string } {
    if (!userMessage) return { handoff: false };
    const norm = userMessage.toLowerCase();

    if (norm.includes('falar com humano') || norm.includes('atendente') || norm.includes('pessoa real')) {
      return { handoff: true, reason: 'Solicitação explícita de atendente humano' };
    }
    if (
      norm.includes('procon') ||
      norm.includes('reclame aqui') ||
      norm.includes('processo') ||
      norm.includes('reembolso')
    ) {
      return { handoff: true, reason: 'Reclamação ou pedido de reembolso/suporte avançado' };
    }
    if (norm.includes('enterprise') || norm.includes('acima de 100k') || norm.includes('projeto grande')) {
      return { handoff: true, reason: 'Lead Enterprise de alto valor' };
    }

    return { handoff: false };
  }

  togglePauseChat(chatId: string, pause?: boolean): { chatId: string; paused: boolean } {
    const cleanId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
    const isPaused = this.pausedChats.has(cleanId);
    const shouldPause = pause !== undefined ? pause : !isPaused;
    if (shouldPause) {
      this.pausedChats.add(cleanId);
    } else {
      this.pausedChats.delete(cleanId);
    }
    this.logger.log(`Chat ${cleanId} AI Auto-reply set to: ${shouldPause ? 'PAUSED' : 'ACTIVE'}`);
    return { chatId: cleanId, paused: shouldPause };
  }

  isChatPaused(chatId: string): boolean {
    const cleanId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
    return this.pausedChats.has(cleanId);
  }

  getPausedChats(): string[] {
    return Array.from(this.pausedChats);
  }

  clearAllPausedChats(): { cleared: number } {
    const count = this.pausedChats.size;
    this.pausedChats.clear();
    this.logger.log(`[Sofia AI] Cleared all ${count} paused chats. All chats unpaused.`);
    return { cleared: count };
  }

  async getConfig(): Promise<AiAgentConfig> {
    let config = await this.configRepo.findOne({ where: {} });
    if (!config) {
      config = this.configRepo.create({
        name: 'OpenWA AI Agent',
        provider: process.env.AI_PROVIDER || 'openrouter',
        systemPrompt:
          'Você é um assistente de vendas e atendimento da empresa. Responda em português do Brasil de forma extremamente clara, amigável e direta ao ponto.',
        model: process.env.OPENAI_MODEL || 'google/gemini-2.5-flash-free',
        temperature: 0.7,
        maxTokens: 500,
        enabled: true,
        autoReplyOnLeadMessage: true,
        autoReplyOnCadenceReply: true,
        typingDelayMs: 2000,
        bufferDelayMs: 5000,
      });
      config = await this.configRepo.save(config);
    }
    return config;
  }

  async updateConfig(data: Partial<AiAgentConfig>): Promise<AiAgentConfig> {
    const config = await this.getConfig();
    Object.assign(config, data);
    return this.configRepo.save(config);
  }

  async getKnowledgeBase(): Promise<AiKnowledge[]> {
    return this.knowledgeRepo.find({ order: { createdAt: 'DESC' } });
  }

  async addKnowledge(item: Partial<AiKnowledge>): Promise<AiKnowledge> {
    const knowledge = this.knowledgeRepo.create(item);
    return this.knowledgeRepo.save(knowledge);
  }

  async updateKnowledge(id: string, item: Partial<AiKnowledge>): Promise<AiKnowledge> {
    await this.knowledgeRepo.update(id, item);
    return this.knowledgeRepo.findOneByOrFail({ id });
  }

  async deleteKnowledge(id: string): Promise<boolean> {
    const res = await this.knowledgeRepo.delete(id);
    return (res.affected || 0) > 0;
  }

  async getLogs(limit = 50): Promise<AiLog[]> {
    return this.logRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  /**
   * Gera a resposta da IA com base nas mensagens passadas + Base de Conhecimento
   */
  async generateResponse(
    userMessage: string,
    history: ChatMessageContext[] = [],
    sessionId?: string,
    chatId?: string,
  ): Promise<string> {
    const startTime = Date.now();
    const config = await this.getConfig();

    if (!config.enabled || this.isGlobalKillSwitchActive()) {
      throw new Error('AI Agent is disabled or Kill Switch is ACTIVE');
    }

    // Check Handoff para atendente humano
    const handoffCheck = this.shouldHandoffToHuman(userMessage);
    if (handoffCheck.handoff) {
      this.logger.warn(`[Handoff Triggered] Chat ${chatId || 'unknown'}: ${handoffCheck.reason}`);
      if (chatId) {
        this.togglePauseChat(chatId, true);
      }
      return `[Transferido para Atendimento Humano: ${handoffCheck.reason}] Olá! Um de nossos consultores humanos assumirá o atendimento por aqui em breve.`;
    }

    // 1. Carregar Base de Conhecimento Ativa
    const activeKnowledge = await this.knowledgeRepo.find({ where: { isActive: true } });
    const knowledgeContext = activeKnowledge.map(k => `[${k.title} (${k.category})]\n${k.content}`).join('\n\n');

    // 2. Montar Instrução de Sistema Completa
    const fullSystemPrompt = `${config.systemPrompt}

--- REGRA OBRIGATÓRIA PARA DETECÇÃO DE ROBÔS / URA ---
Se a mensagem recebida for um menu automático ou robô de loja (ex: "escolha uma opção: 1-, 2-...", "digite 1 para...", "horário de atendimento..."), NUNCA finja ser cliente pedindo catálogo ou orçamento!
Responda de forma direta e educada solicitando falar com o proprietário/responsável:
"Olá! Gostaria de falar com o proprietário ou responsável da loja, por gentileza."
------------------------------------------------------

--- BASE DE CONHECIMENTO & DADOS DA EMPRESA ---
${knowledgeContext.length > 0 ? knowledgeContext : 'Nenhum documento específico cadastrado.'}
----------------------------------------------
Responda sempre com base nas informações fornecidas. Se não souber algo que não está na base, seja honesto e ofereça ajuda com um atendente humano.`;

    const messages: ChatMessageContext[] = [
      { role: 'system', content: fullSystemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    try {
      const chainSvc = this.llmProviderChain || new LlmProviderChainService();
      const fallbackResult = await chainSvc.executeWithFallback(messages, sessionId || 'chip-default');

      // Evaluator Anti-Clichê pré-envio
      const aiReply = this.evaluateAndCleanResponse(fallbackResult.reply);
      const durationMs = Date.now() - startTime;

      // Salvar log de interações
      const log = this.logRepo.create({
        sessionId: sessionId || 'api',
        chatId: chatId || 'playground',
        userMessage,
        aiResponse: aiReply,
        model: fallbackResult.providerUsed,
        tokensUsed: fallbackResult.tokensUsed,
        durationMs,
        status: 'success',
      });
      await this.logRepo.save(log);

      return aiReply;
    } catch (err: any) {
      this.logger.error(`AI Response generation failed: ${err.message}`);

      const log = this.logRepo.create({
        sessionId: sessionId || 'api',
        chatId: chatId || 'playground',
        userMessage,
        aiResponse: '',
        model: config.model || 'llm-chain',
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        status: 'error',
        errorMessage: err.message,
      });
      await this.logRepo.save(log);

      throw err;
    }
  }

  /**
   * Transcreve uma mensagem de áudio recebida de um lead via Groq Whisper e repassa para o handler da IA
   */
  async handleInboundLeadAudioMessage(
    sessionId: string,
    chatId: string,
    audioData: Buffer | string,
    mimetype = 'audio/ogg',
  ) {
    if (!chatId || chatId.endsWith('@g.us')) return;
    if (this.isChatPaused(chatId)) return;

    this.logger.log(`[AiAgent] Incoming voice/audio message received from ${chatId}. Transcribing via Groq...`);

    const transcriber = this.groqTranscriptionService || new GroqTranscriptionService();
    try {
      const transcribedText = await transcriber.transcribeAudio(audioData, mimetype);
      if (transcribedText && transcribedText.trim().length > 0) {
        this.logger.log(`[AiAgent] Transcribed audio for ${chatId}: "${transcribedText}"`);
        await this.handleInboundLeadMessage(sessionId, chatId, `[Áudio de Voz Transcrito]: "${transcribedText}"`);
      } else {
        this.logger.warn(`[AiAgent] Audio transcription returned empty text for ${chatId}`);
      }
    } catch (err: any) {
      this.logger.error(`[AiAgent] Failed to transcribe audio from ${chatId}: ${err.message}`);
    }
  }

  /**
   * Processa uma mensagem recebida de um lead no WhatsApp com BUFFER / DEBOUNCER
   * (Agrupa várias mensagens enviadas seguidas pelo lead antes de chamar a IA)
   */
  async handleInboundLeadMessage(sessionId: string, chatId: string, text: string) {
    if (!chatId || chatId.endsWith('@g.us')) return;
    if (!text || text.trim() === '') return;

    if (this.isChatPaused(chatId)) {
      this.logger.log(`[AiAgent] Auto-reply is PAUSED for chat ${chatId}. Message ignored by Sofia.`);
      return;
    }

    const config = await this.getConfig();
    if (!config.enabled || !config.autoReplyOnLeadMessage) return;

    const bufferKey = `${sessionId}:${chatId}`;
    const bufferDelayMs = config.bufferDelayMs ?? 5000;

    const existingBuffer = this.messageBuffers.get(bufferKey);
    if (existingBuffer) {
      clearTimeout(existingBuffer.timer);
      existingBuffer.messages.push(text);
      existingBuffer.timer = setTimeout(() => {
        this.processBufferedMessages(sessionId, chatId);
      }, bufferDelayMs);
      this.logger.log(
        `[MessageBuffer] Debounced & queued message #${existingBuffer.messages.length} from ${chatId}. Waiting ${bufferDelayMs}ms...`,
      );
    } else {
      const timer = setTimeout(() => {
        this.processBufferedMessages(sessionId, chatId);
      }, bufferDelayMs);

      this.messageBuffers.set(bufferKey, {
        timer,
        messages: [text],
      });
      this.logger.log(`[MessageBuffer] Started ${bufferDelayMs}ms buffer timer for lead ${chatId}...`);
    }
  }

  /**
   * Executa a resposta da IA após o tempo de buffer expirar (com todas as mensagens agrupadas)
   */
  private async processBufferedMessages(sessionId: string, chatId: string) {
    const bufferKey = `${sessionId}:${chatId}`;
    const pending = this.messageBuffers.get(bufferKey);
    if (!pending) return;

    this.messageBuffers.delete(bufferKey);

    const combinedText = pending.messages.join('\n');
    this.logger.log(
      `[MessageBuffer] Processing ${pending.messages.length} buffered message(s) from ${chatId}: "${combinedText.substring(0, 80)}..."`,
    );

    try {
      const config = await this.getConfig();
      let history: ChatMessageContext[] = [];

      if (this.messageRepo) {
        try {
          const recentMessages = await this.messageRepo.find({
            where: { sessionId, chatId },
            order: { createdAt: 'DESC' },
            take: 10,
          });

          history = recentMessages
            .reverse()
            .filter(m => m.body && m.body.trim().length > 0)
            .map(m => ({
              role: m.direction === 'outgoing' ? 'assistant' : 'user',
              content: m.body,
            }));

          // Remove potential duplicate tail if last message matches full combined string
          if (history.length > 0 && history[history.length - 1].content === combinedText) {
            history.pop();
          }
        } catch (err: any) {
          this.logger.warn(`Failed to fetch chat history for ${chatId}: ${err.message}`);
        }
      }

      if (config.typingDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, config.typingDelayMs));
      }

      const aiReply = await this.generateResponse(combinedText, history, sessionId, chatId);

      if (chatId.endsWith('@ig')) {
        // Envia via Instagram
        if (this.instagramService) {
          const igUserId = chatId.split('@')[0];
          await this.instagramService.sendMessage(igUserId, aiReply);
          this.logger.log(`AI Agent sent single debounced reply to IG ${igUserId}: "${aiReply.substring(0, 50)}..."`);
        } else {
          this.logger.warn(`InstagramService unavailable; AI response for IG was generated but not sent.`);
        }
      } else {
        // Envia via WhatsApp (MessageService)
        const messageSvc = this.getMessageService();
        if (messageSvc) {
          await messageSvc.sendText(sessionId, {
            chatId,
            text: aiReply,
          });
          this.logger.log(
            `AI Agent sent single debounced reply to WhatsApp ${chatId}: "${aiReply.substring(0, 50)}..."`,
          );
        } else {
          this.logger.warn(`MessageService unavailable; AI response was generated but not sent.`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to handle buffered lead message with AI: ${err.message}`);
    }
  }
}
