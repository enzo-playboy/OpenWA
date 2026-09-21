/**
 * Fonte única das mensagens de produção usadas pelos scripts de follow-up (scripts/*.js).
 *
 * Extrair para cá permite que os testes automatizados (src/modules/ai-agents/__tests__/)
 * validem as mensagens EXATAS que vão para produção contra as regras do treinamento SDR
 * (content-rules.ts), sem rodar o script nem tocar no WhatsApp/Supabase.
 *
 * Regras aplicadas (PROMPT_TREINAMENTO_SDR_AGENTE.md):
 *   Regra 2: usar o primeiro nome do lead quando existir.
 *   Regra 5: follow-up traz valor novo, NUNCA cobra resposta.
 *   Regra 7: a mensagem termina com UMA pergunta.
 *
 * AGENTS.md:
 *   Regra 2: intervalo mínimo de 6 minutos entre envios no mesmo chip.
 *   Regra 4: leads sob atendimento manual NUNCA recebem disparo automático.
 */

/** Intervalo mínimo obrigatório entre envios no mesmo chip: 360s = 6 min. */
const INTERVALO_MINIMO_MS = 360_000;

/** Jitter máximo adicionado ao intervalo (até 1 min), para os envios não ficarem metronômicos. */
const JITTER_MAXIMO_MS = 60_000;

/** AGENTS.md (regra 4): telefones sob atendimento manual do usuário — nunca disparar. */
const PROTECTED_PHONES = ['5511981381228', '5511930539183'];

/** Normaliza telefone para só dígitos (mesma regra dos agentes em src/). */
const normalizePhone = phone => String(phone || '').replace(/\D/g, '');

/** Primeiro nome do lead, ou string vazia quando não há nome. */
const firstNameOf = name => (name ? String(name).trim().split(/\s+/)[0] : '');

/**
 * Ganchos de valor do Toque 2 (follow-up com valor novo — Regra 5). Cada um:
 * menciona uma novidade concreta, não cobra resposta e termina com UMA pergunta.
 */
const GANCHOS_TOQUE2 = [
  'Essa semana abriu uma vaga na agenda pra montar páginas e catálogos online pra empresas da região e lembrei de vocês. Faz sentido te mostrar um exemplo do resultado?',
  'Terminamos um catálogo online pra uma empresa da região essa semana e o resultado ficou bem legal. Quer que eu te mande um exemplo pra você ver?',
  'A agenda dessa semana abriu espaço pra montar páginas e catálogos online e lembrei de vocês. Te mostro um exemplo rápido?',
];

/**
 * Toque 2: saudação com primeiro nome (Regra 2) + gancho de valor novo (Regra 5),
 * terminando com pergunta (Regra 7).
 */
const buildToque2Message = lead => {
  const first = firstNameOf(lead && lead.name);
  const saudacao = ['Oi', 'Opa'][Math.floor(Math.random() * 2)];
  const gancho = GANCHOS_TOQUE2[Math.floor(Math.random() * GANCHOS_TOQUE2.length)];
  return `${saudacao}${first ? ' ' + first : ''}, tudo bem?\n\n${gancho}`;
};

/**
 * Toque 3 (break-up): reconhecimento da rotina + escolha para o lead, com primeiro nome
 * (Regra 2) e terminando com pergunta (Regra 7). Sem cobrança de resposta (Regra 5).
 */
const buildToque3Message = lead => {
  const first = firstNameOf(lead && lead.name);
  return `Sei que a rotina aí na loja é super corrida, ${first || 'tudo bem'}?\n\nSe não for o momento de criar o site ou catálogo de vocês agora, sem problema. Posso te chamar numa próxima oportunidade ou prefere que eu não te incomode mais?`;
};

module.exports = {
  INTERVALO_MINIMO_MS,
  JITTER_MAXIMO_MS,
  PROTECTED_PHONES,
  GANCHOS_TOQUE2,
  normalizePhone,
  firstNameOf,
  buildToque2Message,
  buildToque3Message,
};
