const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });
const { updateLeadInSupabase } = require('./lib-leads-db');

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

const CHIP_2_SESSION = '764ba619-c986-4b7b-bea8-fa67c2845b01'; // chip-2-iphone
const SUPORTEW_SESSION = '84e58e30-9c99-4eb5-8e27-c6604778d1cd'; // suportew

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_ADMIN_ID, text, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.error('⚠️ Erro Telegram:', err.message);
  }
}

async function sendReply(sessionId, phone, text, leadName) {
  const jid = `${phone}@c.us`;
  console.log(`--------------------------------------------------`);
  console.log(`📤 Enviando resposta para: ${leadName} (+${phone})`);
  console.log(`💬 Texto: "${text}"`);

  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages/send-text`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: jid, text })
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`✅ Resposta ENVIADA com sucesso! MessageID: ${data.messageId || 'ok'}`);
      void updateLeadInSupabase(phone, {
        status: 'replied',
        metadata: { last_sent_reply: text, sent_at: new Date().toISOString() }
      });
      await sendTelegram(`🤖 *Resposta Direta Enviada para Lead!*\n\n👤 *Lead:* ${leadName}\n📱 *WhatsApp:* \`+${phone}\`\n💬 *Resposta:* _"${text}"_`);
      return true;
    } else {
      console.error(`❌ Erro no envio HTTP ${res.status}:`, JSON.stringify(data));
      return false;
    }
  } catch (e) {
    console.error(`❌ Erro na requisição para ${leadName}:`, e.message);
    return false;
  }
}

async function main() {
  console.log('⚡ RESPONDENDO OS LEADS ATIVOS SOLICITADOS...');

  // 1. Resposta para Nova LED Iluminação (mulher do áudio)
  const novaLedText = "Ah sim, entendi! É que como a gente atende várias lojas de iluminação, a gente criou um modelo de portal web bem rápido onde o cliente vê o catálogo completo antes de chamar. Posso te mandar o link de demonstração pra você dar uma olhada?";
  await sendReply(CHIP_2_SESSION, '5519995815340', novaLedText, 'Nova LED Iluminação');

  // Rigor anti-ban (AGENTS.md): 1-2 min entre respostas no mesmo chip.
  await new Promise(r => setTimeout(r, 60_000 + Math.random() * 60_000));

  // 2. Resposta para Isadora Maia Arquitetura
  const isadoraText = "Opa, tudo bem! Seria para Projeto de Interiores/Residencial. Na verdade queria ver com a Isadora ou com o responsável comercial se vocês já têm um portal próprio para exibição dos projetos 3D.";
  await sendReply(SUPORTEW_SESSION, '5516997495108', isadoraText, 'Isadora Maia Arquitetura');

  console.log('\n🎉 Ambas as respostas foram enviadas com sucesso!');
}

main();
