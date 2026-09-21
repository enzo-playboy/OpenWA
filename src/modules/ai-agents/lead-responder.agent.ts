import { Injectable } from '@nestjs/common';
import { createLogger } from '../../common/services/logger.service';
import { LlmProviderChainService, ChatMessage } from '../ai-agent/llm-provider-chain.service';
import { recordAgentDecision } from './agents-metrics';
import { OptOutRegistry } from './safety-guardrails.agent';
import { looksLikeRefusal } from './opt-out-detector';
import { containsCollection, endsWithQuestion } from './content-rules';

/**
 * Lead Responder Agent — the conversation half of the pipeline.
 *
 * When a lead replies to an approved dispatch, this agent classifies the reply's intent and
 * decides the handling:
 *   interested    -> contextual reply that moves the conversation forward
 *   question      -> answers with the provided knowledge base
 *   busy/later    -> polite ack, offers to follow up later (no further auto-touches)
 *   refuse        -> auto opt-out (LGPD) + goodbye — never contacted again
 *   handoff       -> escalates to a human immediately
 *   unsure        -> low-confidence fallback: escalates rather than guessing
 *
 * It NEVER runs when a human has taken over the chat (see PausedChatsBridge) and it registers the
 * chat as human-handled for Sofia (the legacy auto-responder) so the two agents never double-reply.
 *
 * SDR training rules enforced here (see content-rules.ts / PROMPT_TREINAMENTO_SDR_AGENTE.md): a
 * reply never contains collection/pressure phrasing (Regra 5) and never ends in silence — the
 * final question is appended deterministically when the model forgot (Regra 7). Audio is never
 * proposed without the permission question, and call invitations always schedule a time first.
 */

export type LeadIntent = 'interested' | 'question' | 'busy' | 'refuse' | 'handoff' | 'unsure';

export interface ConversationTurn {
  role: 'lead' | 'agent';
  text: string;
  at: string;
}

export interface ResponderDecision {
  intent: LeadIntent;
  reply: string | null; // null => no auto-reply (handoff / opt-out silence / unsure escalation)
  action: 'reply' | 'opt_out' | 'escalate' | 'wait';
  confidence: number;
  source: 'llm' | 'rules';
}

/** Patterns signaling the lead wants a human right now. */
const HANDOFF_PATTERNS: RegExp[] = [
  /falar com (um )?(humano|atendente|pessoa|algu[ée]m|respons[aá]vel)/i,
  /me passa (um )?(humano|atendente|pessoa)/i,
  /atendimento humano/i,
];

/** Patterns signaling "not now" (busy/later) — no further auto-touches either. */
const BUSY_PATTERNS: RegExp[] = [
  /estou (ocupad|em reuni|viajand|trabalhando)/i,
  /depois|mais tarde|outra hora|semana que vem|m[êe]s que vem/i,
  /agora n[aã]o|neste momento n[aã]o|t[aá] apertado/i,
];

const INTERESTED_PATTERNS: RegExp[] = [
  /^(sim|pode ser|vamos|bora|quero|me interessa|tenho interesse|manda|fala)/i,
  /que (isso|legal|interessante)|me cont[aá]|como (funciona|seria|é)|quanto (custa|sai)/i,
];

const RESPONDER_SYSTEM_PROMPT = `Você é o SDR humano da nossa equipe continuando uma conversa no WhatsApp com um lead B2B brasileiro que RESPONDEU à nossa prospecção.

REGRAS OBRIGATÓRIAS:
- Português brasileiro informal-profissional, mensagem CURTA (máximo 300 caracteres, 1-2 parágrafos).
- Responda EXATAMENTE o que a pessoa perguntou. Não empurre agenda se ela não pediu.
- SEM markdown, SEM asteriscos, SEM listas, SEM links. NUNCA prometa desconto, preço fechado ou prazo.
- Se a pessoa demonstrou dúvida, ajude com clareza usando apenas as informações fornecidas.
- Se pediram para parar, responda com educação e confirme que não vai mais receber contato (1 frase).
- Se não souber algo, diga que vai confirmar com o time e retorna. NÃO invente.

TREINAMENTO SDR (obrigatório):
- Use o primeiro nome do lead quando ele estiver no contexto. NUNCA invente nome.
- Português correto, SEM abreviações informais (nada de "vc", "blz", "obg"). Frases curtas, sem prolixidade.
- NUNCA envie áudio nem diga que vai mandar áudio sem antes pedir autorização. Se o áudio ajudar a explicar uma dúvida, a resposta deve ser APENAS o pedido de permissão: "{nome}, acredito que por áudio vou conseguir te explicar com muito mais clareza. Posso te enviar um áudio? Você tem disponibilidade para ouvir?". Se o lead preferir escrito, respeite e fique no texto.
- Se a dúvida for complexa ou o lead demonstrar interesse em avançar, proponha uma LIGAÇÃO com horário combinado (nunca ligue sem avisar): "{nome}, acredito que é melhor ainda a gente conversar por uma ligação. Quando você tem disponibilidade?".
- PROIBIDO cobrar resposta ("tô aguardando", "vai me responder?", "por que sumiu").
- Termine SEMPRE com UMA pergunta que conduza a conversa. NUNCA termine em silêncio.

Responda APENAS com o texto da mensagem.`;

@Injectable()
export class LeadResponderAgent {
  private readonly logger = createLogger('LeadResponderAgent');
  /** Conversa em memória (por telefone): anel de turnos, suficiente para contexto do LLM. */
  private readonly conversations = new Map<string, ConversationTurn[]>();
  private static readonly MAX_TURNS = 20;

  constructor(private readonly llm: LlmProviderChainService) {}

  /**
   * Main entry: the lead said something. Returns the decision (intent + reply + action).
   * The CALLER sends the reply when action === 'reply' — this agent never sends by itself.
   */
  async handleLeadMessage(
    phone: string,
    text: string,
    context: { company?: string; niche?: string; knowledgeBase?: string } = {},
  ): Promise<ResponderDecision> {
    this.recordTurn(phone, 'lead', text);

    // 1. Opt-out / refusal — rules first (LGPD wins over any LLM creativity).
    if (looksLikeRefusal(text)) {
      OptOutRegistry.add(phone, 'recusa na conversa (auto)');
      recordAgentDecision('responder', 'reject', 'rules');
      this.recordTurn(phone, 'agent', '__opt_out__');
      return {
        intent: 'refuse',
        reply: 'Perfeito, entendi! Não vou mais te chamar. Qualquer coisa, estou por aqui. 🙏',
        action: 'opt_out',
        confidence: 1,
        source: 'rules',
      };
    }

    // 2. Explicit human request.
    if (HANDOFF_PATTERNS.some(re => re.test(text))) {
      recordAgentDecision('responder', 'hold', 'rules');
      this.recordTurn(phone, 'agent', '__escalate__');
      return {
        intent: 'handoff',
        reply: null,
        action: 'escalate',
        confidence: 1,
        source: 'rules',
      };
    }

    // 3. Classify + answer via LLM, with rules as the fallback.
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: RESPONDER_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(this.buildContext(phone, text, context)) },
      ];
      const { reply, providerUsed } = await this.llm.executeWithFallback(messages, 'agents-responder');
      const clean = this.sanitize(reply);
      if (clean.length >= 5 && !containsCollection(clean)) {
        const intent = this.classifyIntent(text);
        const finalText = this.ensureFinalQuestion(clean, intent);
        this.recordTurn(phone, 'agent', finalText);
        recordAgentDecision('responder', 'dispatch', 'llm');
        return {
          intent,
          reply: finalText,
          action: intent === 'busy' ? 'wait' : 'reply',
          confidence: 0.8,
          source: 'llm',
        };
      }
      this.logger.warn(`Responder LLM (${providerUsed}) returned unusable output; falling back to rules.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Responder LLM chain failed; falling back to rules: ${msg}`);
    }

    // 4. Rules fallback: acknowledge and hand to a human rather than risk a bad auto-reply.
    recordAgentDecision('responder', 'hold', 'rules');
    return {
      intent: this.classifyIntent(text),
      reply: null,
      action: 'escalate',
      confidence: 0.4,
      source: 'rules',
    };
  }

  /** Conversation memory for the chat view / API. Newest last. */
  getHistory(phone: string, limit = 20): ConversationTurn[] {
    const normalized = this.normalize(phone);
    return [...(this.conversations.get(normalized) ?? [])].slice(-limit);
  }

  /** Called when a human takes the chat over: the agent steps aside until explicitly resumed. */
  markHumanTakeover(phone: string): void {
    this.recordTurn(phone, 'agent', '__human_takeover__');
  }

  private buildContext(
    phone: string,
    text: string,
    context: { company?: string; niche?: string; knowledgeBase?: string },
  ): Record<string, unknown> {
    const history = this.getHistory(phone, 10).map(t => ({ from: t.role, text: t.text }));
    return {
      conversationHistory: history,
      leadMessage: text,
      leadContext: {
        company: context.company ?? null,
        niche: context.niche ?? null,
      },
      knowledgeBase: context.knowledgeBase ?? null,
      rules: {
        optOutIfAsked: true,
        neverInventFacts: true,
        escalateWhenUnsure: true,
      },
    };
  }

  private classifyIntent(text: string): LeadIntent {
    if (looksLikeRefusal(text)) return 'refuse';
    if (HANDOFF_PATTERNS.some(re => re.test(text))) return 'handoff';
    if (BUSY_PATTERNS.some(re => re.test(text))) return 'busy';
    if (INTERESTED_PATTERNS.some(re => re.test(text))) return 'interested';
    return 'unsure';
  }

  private recordTurn(phone: string, role: 'lead' | 'agent', text: string): void {
    const normalized = this.normalize(phone);
    const turns = this.conversations.get(normalized) ?? [];
    turns.push({ role, text, at: new Date().toISOString() });
    while (turns.length > LeadResponderAgent.MAX_TURNS) turns.shift();
    this.conversations.set(normalized, turns);
  }

  private normalize(phone: string): string {
    return (phone || '').replace(/\D/g, '');
  }

  /** Same content rules as the message agent. */
  private sanitize(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Training rule 7 (Regra de Ouro): a conversational reply must not end in silence. The LLM is
   * instructed to close with a question; this is the deterministic backstop that appends the
   * neutral conducting question when the model forgot. Opt-out goodbyes are exempt (they must
   * NOT invite more conversation) and the 'busy' intent keeps the ack (a follow-up offer is
   * already part of the intent semantics).
   */
  private ensureFinalQuestion(text: string, intent?: LeadIntent): string {
    if (intent === 'refuse' || intent === 'busy') return text;
    if (endsWithQuestion(text)) return text;
    return `${text}\n\nFicou alguma dúvida?`;
  }
}
