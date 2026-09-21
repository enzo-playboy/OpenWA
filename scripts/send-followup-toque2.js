const dotenv = require('dotenv');
dotenv.config();

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://localhost:2785/api';

// AGENTS.md (regra 2): intervalo mínimo obrigatório de 6 minutos entre envios no mesmo chip.
const INTERVALO_MINIMO_MS = 360_000; // 360s = 6 min; com jitter fica entre 6 e 7 min.

// AGENTS.md (regra 4): leads sob atendimento manual NUNCA recebem disparo automático.
const PROTECTED_PHONES = ['5511981381228', '5511930539183'];

/**
 * Follow-up do Toque 2 — regras do treinamento (PROMPT_TREINAMENTO_SDR_AGENTE.md):
 *   Regra 5: NUNCA cobrar resposta ("Conseguiu ver a mensagem anterior?", "tô aguardando" etc.).
 *            Cada follow-up traz um NOVO contexto/valor.
 *   Regra 7: a mensagem sempre termina com UMA pergunta.
 *   Regra 2: usar o primeiro nome do lead quando existir.
 */
const GANCHOS_DE_VALOR = [
  'Essa semana abriu uma vaga na agenda pra montar páginas e catálogos online pra empresas da região e lembrei de vocês. Faz sentido te mostrar um exemplo do resultado?',
  'Terminamos um catálogo online pra uma empresa da região essa semana e o resultado ficou bem legal. Quer que eu te mande um exemplo pra você ver?',
  'A agenda dessa semana abriu espaço pra montar páginas e catálogos online e lembrei de vocês. Te mostro um exemplo rápido?',
];

async function execute() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing.');
    return;
  }

  // 1. Fetch leads that received Toque 1 (current_step = 1) and haven't replied (status = contacted)
  console.log('🔍 Buscando leads elegíveis para o Toque 2 (Follow-up com valor)...');
  const res = await fetch(supabaseUrl + '/rest/v1/leads?select=*&status=eq.contacted&current_step=eq.1', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
  });

  const leads = await res.json();

  if (!leads || leads.length === 0) {
    console.log('✅ Nenhum lead aguardando Toque 2 no momento.');
    return;
  }

  console.log(`Encontrados ${leads.length} leads para o Toque 2.`);

  // 2. Loop and send Toque 2
  for (const lead of leads) {
    const phone = String(lead.phone || '').replace(/\D/g, '');
    const leadName = lead.name || '';
    const firstName = leadName ? leadName.trim().split(' ')[0] : '';
    const chatId = phone + '@c.us';

    // AGENTS.md (regra 4): pulando leads sob atendimento manual do usuário.
    if (PROTECTED_PHONES.includes(phone)) {
      console.log(`⏭️  ${firstName || phone} está sob atendimento manual, pulando.`);
      continue;
    }

    // Regra 2 + Regra 5 + Regra 7: nome, valor novo, termina em pergunta. Sem cobrança.
    const gancho = GANCHOS_DE_VALOR[Math.floor(Math.random() * GANCHOS_DE_VALOR.length)];
    const saudacao = ['Oi', 'Opa'][Math.floor(Math.random() * 2)];
    const text = `${saudacao}${firstName ? ' ' + firstName : ''}, tudo bem?\n\n${gancho}`;

    console.log(`🚀 Enviando Toque 2 para ${firstName || phone} (${chatId})...`);

    try {
      const sendRes = await fetch(BASE_URL + '/sessions/' + SESSION_ID + '/messages/send-text', {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chatId, text })
      });

      if (sendRes.ok) {
        // Update to current_step 2
        await fetch(supabaseUrl + '/rest/v1/leads?phone=eq.' + phone, {
          method: 'PATCH',
          headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_step: 2 })
        });
        console.log(`✅ Toque 2 enviado com sucesso para ${firstName || phone}!`);
      } else {
        console.error(`❌ Falha ao enviar para ${firstName || phone}: ${sendRes.status}`);
      }
    } catch (e) {
      console.error(`❌ Erro de conexão ao enviar para ${firstName || phone}:`, e.message);
    }

    // AGENTS.md (regra 2): intervalo mínimo de 6 minutos no mesmo chip (com jitter de até 1 min).
    console.log('⏳ Aguardando intervalo mínimo de 6 minutos (regra anti-ban)...');
    await new Promise(r => setTimeout(r, INTERVALO_MINIMO_MS + Math.random() * 60_000));
  }
}

execute();
