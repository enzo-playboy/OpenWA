import { createLogger } from '../../common/services/logger.service';
import { OptOutRegistry } from './safety-guardrails.agent';

/**
 * Shared opt-out/refusal detector for inbound lead replies.
 *
 * LGPD art. 18, IV: the moment a lead asks to stop, EVERY outbound path must stop — not just the
 * agent pipeline. Before this detector the registry was only fed by the lead-responder agent, so a
 * refusal landing in a Sofia-handled or cadence-handled chat was never registered and the lead kept
 * being eligible for new proposals and cadence touches.
 *
 * Kept separate from LeadResponderAgent so both the projector gate and the responder reuse the
 * exact same patterns (a refusal classified differently by two code paths is a compliance hole).
 * Detection is rules-only: no LLM on the hot path, no false negatives from a provider outage.
 */

const logger = createLogger('OptOutDetector');

/** Refusal/opt-out patterns — canonical list. Conservative: ambiguity escalates, never blocks. */
export const REFUSE_PATTERNS: RegExp[] = [
  /n[aã]o (quero|tenho interesse|me chama|me procure|me envie|gostaria)/i,
  /me (remove|remova|tir[ae] (da lista|daqui)|exclu)/i,
  /para (de me chamar|de mandar|de enviar)/i,
  /n[aã]o (mand|envi) mais/i,
  /descadastro|descadastrar|unsubscribe|opt.?out/i,
];

/** True when the text looks like a refusal/opt-out request. */
export function looksLikeRefusal(text: string): boolean {
  if (!text || !text.trim()) return false;
  return REFUSE_PATTERNS.some(re => re.test(text));
}

/**
 * Registers the opt-out durably when the message is a refusal. Returns true when the message was
 * classified as an opt-out (registry written). Idempotent: re-adding the same phone only refreshes
 * the registry entry.
 */
export function registerOptOutIfRefusal(sessionId: string, chatId: string, text: string): boolean {
  if (!looksLikeRefusal(text)) return false;
  OptOutRegistry.add(chatId, `recusa na conversa (auto, sessão ${sessionId})`);
  logger.log(`[OptOut] Lead ${chatId} pediu exclusão — registry atualizado (sessão ${sessionId}).`);
  return true;
}
