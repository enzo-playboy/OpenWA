const dotenv = require('dotenv');
dotenv.config();

const {
  buildToque2Message,
  INTERVALO_MINIMO_MS,
  JITTER_MAXIMO_MS,
  PROTECTED_PHONES,
  normalizePhone,
  firstNameOf,
} = require('./production-messages');
const { canDispatch, recordDispatch, usedToday, DAILY_QUOTA_PER_CHIP } = require('./lib-chip-quota');

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
// O SESSION_ID precisa ser atualizado se você criou uma nova sessão.
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';

const customLeads = [
  { phone: '556791311680', name: 'Lead' }
];

async function execute() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  console.log('🔍 Iniciando disparos de Follow-up (Toque 2) para lista customizada...');

  for (const lead of customLeads) {
    // Quota diária por chip (40/dia), compartilhada entre todos os scripts via lib-chip-quota.
    if (!canDispatch(SESSION_ID)) {
      console.log(`🛑 Quota diária de ${DAILY_QUOTA_PER_CHIP} do chip atingida (${usedToday(SESSION_ID)} hoje). Interrompendo.`);
      break;
    }

    const phone = normalizePhone(lead.phone);
    const firstName = firstNameOf(lead.name);
    const chatId = phone + '@c.us';

    // AGENTS.md (regra 4): leads sob atendimento manual NUNCA recebem disparo automático.
    if (PROTECTED_PHONES.includes(phone)) {
      console.log(`⏭️  ${firstName || phone} está sob atendimento manual, pulando.`);
      continue;
    }

    // Mensagem vem da fonte única (scripts/production-messages.js), já validada por testes
    // contra as regras do treinamento SDR (Regras 2, 5 e 7). Sem cobrança.
    const text = buildToque2Message(lead);

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
        recordDispatch(SESSION_ID);
        console.log(`📊 Quota do chip hoje: ${usedToday(SESSION_ID)}/${DAILY_QUOTA_PER_CHIP}`);
        console.log(`✅ Toque 2 enviado com sucesso para ${firstName || phone}!`);
        // Atualiza no banco se houver credenciais
        if (supabaseUrl && supabaseKey) {
          await fetch(supabaseUrl + '/rest/v1/leads?phone=eq.' + phone, {
            method: 'PATCH',
            headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_step: 2 })
          });
        }
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

  console.log('🎉 Finalizado envio de follow-ups customizados!');
}

execute();
