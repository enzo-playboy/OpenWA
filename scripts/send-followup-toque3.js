const dotenv = require('dotenv');
dotenv.config();

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://localhost:2785/api';

// AGENTS.md (regra 2): intervalo mínimo obrigatório de 6 minutos entre envios no mesmo chip.
const INTERVALO_MINIMO_MS = 360_000; // 360s = 6 min; com jitter fica entre 6 e 7 min.

// AGENTS.md (regra 4): leads sob atendimento manual NUNCA recebem disparo automático.
const PROTECTED_PHONES = ['5511981381228', '5511930539183'];

async function execute() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing.');
    return;
  }

  // 1. Fetch leads that received Toque 2 (current_step = 2) and haven't replied (status = contacted)
  console.log('🔍 Buscando leads elegíveis para o Toque 3 (Break-up)...');
  const res = await fetch(supabaseUrl + '/rest/v1/leads?select=*&status=eq.contacted&current_step=eq.2', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
  });
  
  const leads = await res.json();
  
  if (!leads || leads.length === 0) {
    console.log('✅ Nenhum lead aguardando Toque 3 no momento.');
    return;
  }

  console.log(`Encontrados ${leads.length} leads para o Toque 3.`);

  // 2. Loop and send Toque 3
  for (const lead of leads) {
    const phone = String(lead.phone || '').replace(/\D/g, '');
    const firstName = lead.name ? lead.name.trim().split(' ')[0] : '';
    const chatId = phone + '@c.us';

    // AGENTS.md (regra 4): pulando leads sob atendimento manual do usuário.
    if (PROTECTED_PHONES.includes(phone)) {
      console.log(`⏭️  ${firstName || phone} está sob atendimento manual, pulando.`);
      continue;
    }

    // Break-up alinhado ao treinamento (PROMPT_TREINAMENTO_SDR_AGENTE.md):
    // Regra 2 (nome) + Regra 7 (termina com pergunta). Sem cobrança de resposta.
    const text = `Sei que a rotina aí na loja é super corrida, ${firstName || 'tudo bem'}?\n\nSe não for o momento de criar o site ou catálogo de vocês agora, sem problema. Posso te chamar numa próxima oportunidade ou prefere que eu não te incomode mais?`;
    console.log(`🚀 Enviando Toque 3 (Break-up) para ${firstName || phone} (${chatId})...`);

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
        // Update to current_step 3 and status 'archived' (or 'lost' since they never replied)
        await fetch(supabaseUrl + '/rest/v1/leads?phone=eq.' + phone, {
          method: 'PATCH',
          headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_step: 3, status: 'lost' }) // Marking as lost since they ignored 3 messages
        });
        console.log(`✅ Toque 3 enviado com sucesso para ${firstName || phone}! (Lead marcado como perdido)`);
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
