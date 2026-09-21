const dotenv = require('dotenv');
dotenv.config();

const {
  buildToque3Message,
  INTERVALO_MINIMO_MS,
  JITTER_MAXIMO_MS,
  PROTECTED_PHONES,
  normalizePhone,
  firstNameOf,
} = require('./production-messages');
const { canDispatch, recordDispatch, usedToday, DAILY_QUOTA_PER_CHIP } = require('./lib-chip-quota');

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://localhost:2785/api';

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
    // Quota diária por chip (40/dia), compartilhada entre todos os scripts via lib-chip-quota.
    if (!canDispatch(SESSION_ID)) {
      console.log(`🛑 Quota diária de ${DAILY_QUOTA_PER_CHIP} do chip atingida (${usedToday(SESSION_ID)} hoje). Interrompendo.`);
      break;
    }

    const phone = normalizePhone(lead.phone);
    const firstName = firstNameOf(lead.name);
    const chatId = phone + '@c.us';

    // AGENTS.md (regra 4): pulando leads sob atendimento manual do usuário.
    if (PROTECTED_PHONES.includes(phone)) {
      console.log(`⏭️  ${firstName || phone} está sob atendimento manual, pulando.`);
      continue;
    }

    // Mensagem vem da fonte única (scripts/production-messages.js), já validada por testes
    // contra as regras do treinamento SDR (Regras 2, 5 e 7).
    const text = buildToque3Message(lead);

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
        recordDispatch(SESSION_ID);
        console.log(`📊 Quota do chip hoje: ${usedToday(SESSION_ID)}/${DAILY_QUOTA_PER_CHIP}`);
        // Update to current_step 3 and status 'lost' (they ignored 3 messages)
        await fetch(supabaseUrl + '/rest/v1/leads?phone=eq.' + phone, {
          method: 'PATCH',
          headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_step: 3, status: 'lost' })
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
    await new Promise(r => setTimeout(r, INTERVALO_MINIMO_MS + Math.random() * JITTER_MAXIMO_MS));
  }
}

execute();
