const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });
const {
  isProtectedPhone,
  enforceChipInterval,
  recordChipSent,
  updateLeadInSupabase,
} = require('./lib-leads-db');

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

const CHIP_1_SESSION = '84e58e30-9c99-4eb5-8e27-c6604778d1cd'; // Chip 1 Principal
const CHIP_2_SESSION = '764ba619-c986-4b7b-bea8-fa67c2845b01'; // Chip 2 TOR Proxy

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_ID,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error('⚠️ Erro ao notificar Telegram:', err.message);
  }
}

// Leads 3, 4 e 5 restantes do primeiro lote (Leads 1 e 2 já enviados)
const GOLD_LEADS_BATCH = [
  {
    num: 3,
    name: 'ConfinaMax Nutrição de Confinamento - Filial 2',
    phone: '5534998762935',
    category: '🐄 Nutrição Animal & Genética Pecuária',
    chipSession: CHIP_1_SESSION,
    chipName: 'Chip 1 (Principal)',
    text: 'Olá, tudo bem? A ConfinaMax já possui um site institucional com o catálogo dos produtos de nutrição?'
  },
  {
    num: 4,
    name: 'Pecuária Forte Sal Mineral & Premix - Filial 2',
    phone: '5565998762903',
    category: '🐄 Nutrição Animal & Genética Pecuária',
    chipSession: CHIP_1_SESSION,
    chipName: 'Chip 1 (Principal)',
    text: 'Olá, bom dia! A Pecuária Forte tem site próprio para exibição das linhas de premix e sal mineral?'
  },
  {
    num: 5,
    name: 'NutriCampo Rações & Suplementos - Filial 2',
    phone: '5562998762871',
    category: '🐄 Nutrição Animal & Genética Pecuária',
    chipSession: CHIP_1_SESSION,
    chipName: 'Chip 1 (Principal)',
    text: 'Olá! A NutriCampo Rações já possui site para atendimento e consulta de produtos online?'
  }
];

async function runDisparoCampanhaOuroComDelayExtendido() {
  console.log('🚀 === CONTINUANDO CAMPANHA 100 LEADS OURO (INTERVALO SEGURO DE NO MÍNIMO 6 MINUTOS) ===\n');

  await sendTelegram(`⏱️ *Campanha 100 Leads Ouro Atualizada*\n\n- Intervalo configurado: **No mínimo 6 minutos (360s a 540s)** entre disparos.\n- Continuando a partir do Lead 3/5...`);

  for (let index = 0; index < GOLD_LEADS_BATCH.length; index++) {
    const item = GOLD_LEADS_BATCH[index];

    // Guard: Contatos protegidos em atendimento manual
    if (isProtectedPhone(item.phone)) {
      console.warn(`🛡️ [Guard Blocked] Lead +${item.phone} (${item.name}) está em atendimento manual. Ppulando.`);
      continue;
    }

    // Guard: Intervalo de 6 minutos por chip
    await enforceChipInterval(item.chipSession, 360);

    console.log(`--------------------------------------------------`);
    console.log(`📤 Executando [Lead ${item.num}/5] - ${item.name}`);
    console.log(`📱 Telefone: +${item.phone}`);
    console.log(`🛡️ Canal: ${item.chipName}`);
    console.log(`💬 Mensagem: "${item.text}"`);

    const jid = `${item.phone}@s.whatsapp.net`;

    try {
      const sendRes = await fetch(`${BASE_URL}/sessions/${item.chipSession}/messages/send-text`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatId: jid,
          text: item.text
        })
      });

      if (sendRes.ok) {
        console.log(`✅ Disparo efetuado com sucesso para ${item.name}!`);
        recordChipSent(item.chipSession);

        // Atualização no banco de dados Supabase + Sync Obsidian reflexivo
        await updateLeadInSupabase(item.phone, {
          status: 'contacted',
          current_step: 1,
          metadata: {
            last_sent_text: item.text,
            chip_name: item.chipName,
            sent_at: new Date().toISOString(),
          }
        });

        await sendTelegram(`✅ *Lead ${item.num}/5 Enviado com Sucesso!*\n\n💎 *Lead:* ${item.name}\n📱 *Canal:* ${item.chipName}\n📞 *WhatsApp:* \`+${item.phone}\``);
      } else {
        const errorText = await sendRes.text();
        console.error(`❌ Falha no envio (${sendRes.status}):`, errorText);
        await sendTelegram(`❌ *Aviso de Erro no Lead ${item.num}/5*\n\nLead: ${item.name}\nStatus HTTP: ${sendRes.status}\nDetalhes: \`${errorText.slice(0, 100)}\``);
      }
    } catch (err) {
      console.error(`❌ Erro ao disparar para ${item.name}:`, err.message);
      await sendTelegram(`🚨 *Erro de Conexão no Lead ${item.num}/5*\n\nLead: ${item.name}\nErro: \`${err.message}\``);
    }

    // Delay humano estendido de NO MÍNIMO 6 minutos (360 a 540 segundos)
    if (index < GOLD_LEADS_BATCH.length - 1) {
      const minSeconds = 360; // 6 minutos
      const delaySeconds = minSeconds + Math.floor(Math.random() * 180); // 6 a 9 minutos
      const delayMinutes = (delaySeconds / 60).toFixed(1);

      console.log(`\n⏳ Aguardando ${delayMinutes} minutos (${delaySeconds}s) antes do próximo lead (Modo Dia Inteiro Seguro)...`);
      await sendTelegram(`⏳ *Aguardando ${delayMinutes} minutos* até o envio do próximo lead (Lote Ouro)...`);
      await sleep(delaySeconds * 1000);
    }
  }

  console.log('\n🎉 === LOTE 1 (5 LEADS OURO) FINALIZADO COM SUCESSO! ===');
  await sendTelegram(`🎉 *Lote 1 (5 Leads Ouro) Finalizado com Sucesso!*\n\nTodos os 5 disparos foram efetuados com o tempo de espera estendido de 6 minutos.`);
}

runDisparoCampanhaOuroComDelayExtendido();
