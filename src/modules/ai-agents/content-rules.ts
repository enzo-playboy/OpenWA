/**
 * Content rules from the SDR training (PROMPT_TREINAMENTO_SDR_AGENTE.md) shared by every agent
 * that writes WhatsApp messages.
 *
 * Two hard gates are enforced here regardless of where the text came from (LLM or template):
 *
 *  1. FINAL QUESTION RULE (Regra de Ouro / training rule 7): every outbound message must END with
 *     a question, so the conversation is never left in silence. The accepted forms are '?' (with
 *     or without the WhatsApp-style trailing '*' seen in the training scripts) and '؟' is NOT
 *     accepted (Arabic question mark) — plain ASCII/latin '?' only, matched leniently over the
 *     closing punctuation run so "…, certo??" or "…, pode ser? 🙏" still pass.
 *
 *  2. COLLECTION BAN (training rule 5): follow-up pressure phrases ("tô aguardando sua resposta",
 *     "vai me responder?", "por que você sumiu"...) are FORBIDDEN. A follow-up must bring NEW
 *     value (context, information, social proof), never a demand for a reply. The detector is
 *     deliberately generous (matches through accents, case and spacing) so borderline phrasings
 *     fail closed: a rejected message falls back to the template path, it is never sent as-is.
 */

/** Accent-agnostic fragment: each vowel expands to its accented variants (case-insensitive). */
const flexible = (fragment: string): RegExp => {
  const map: Record<string, string> = {
    a: '[aáàãâä]',
    e: '[eéèêë]',
    i: '[iíìîï]',
    o: '[oóòõôö]',
    u: '[uúùûü]',
    c: '[cç]',
  };
  const source = fragment
    .toLowerCase()
    .split('')
    .map(ch => map[ch] ?? ch)
    .join('');
  return new RegExp(source.replace(/\s+/g, '\\s+'), 'i');
};

/** All forms currently banned by the collection rule (training rule 5). */
const COLLECTION_PATTERNS: RegExp[] = [
  flexible('tô aguardando sua resposta'),
  flexible('estou aguardando sua resposta'),
  flexible('aguardando retorno'),
  flexible('aguardo seu retorno'),
  flexible('vai me responder'),
  flexible('voce vai responder'),
  flexible('me responde por favor'),
  flexible('responde aí'),
  flexible('por que voce sumiu'),
  flexible('pq sumiu'),
  flexible('me da um oi'),
  flexible('posso te chamar de novo'),
  flexible('vi que leu e nao respondeu'),
];

/**
 * True when the message ends with a question mark (the final-question rule).
 * Accepts trailing decoration (quotes, asterisks, emoji/whitespace) before the '?' — the guard is
 * about the CONVERSATION being left in silence, not about typographic perfection.
 */
export const endsWithQuestion = (text: string): boolean => {
  const trimmed = (text ?? '').trimEnd();
  if (!trimmed) return false;
  // Walk back over anything that is not sentence punctuation: the '?' may be followed by a
  // decorative quote, asterisk or emoji and still be the closing question of the message.
  let i = trimmed.length - 1;
  while (i >= 0 && !'.!?…'.includes(trimmed[i])) {
    // Stop scanning at a hard terminator: anything after a sentence end is decoration only.
    i--;
  }
  if (i < 0) return false;
  // From the first punctuation found backwards, the message must end in '?' (optionally repeated).
  const tail = trimmed.slice(0, i + 1);
  return /\?+\s*$/.test(tail) && tail.trimEnd().endsWith('?');
};

/** True when the text contains any banned collection/pressure phrase (training rule 5). */
export const containsCollection = (text: string): boolean => {
  const normalized = (text ?? '').toLowerCase();
  if (!normalized) return false;
  return COLLECTION_PATTERNS.some(re => re.test(normalized));
};

/** Combined check for the outbound gates, with per-gate flags for logging/proposals. */
export interface ContentRuleResult {
  /** Message passes BOTH gates and may be proposed/sent. */
  ok: boolean;
  /** Missing the mandatory final question (training rule 7). */
  missingFinalQuestion: boolean;
  /** Contains a banned collection/pressure phrase (training rule 5). */
  collection: boolean;
}
