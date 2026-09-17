const http = require('http');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const PORT = process.env.WEBHOOK_SERVER_PORT || 2789;
const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

const SESSIONS = {
  '84e58e30-9c99-4eb5-8e27-c6604778d1cd': { name: 'Chip 1 (Suporte Agro/B2B)', phone: '556596466243' },
  '764ba619-c986-4b7b-bea8-fa67c2845b01': { name: 'Chip 2 (TOR Proxy Ouro)', phone: '556593455291' }
};

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_ADMIN_ID, text, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.error('⚠️ Telegram error:', err.message);
  }
}

async function sendWhatsAppReply(sessionId, phone, text) {
  try {
    const cleanDigits = phone.replace(/\D/g, '');
    const jid = `${cleanDigits}@s.whatsapp.net`;
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages/send-text`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: jid, text })
    });
    console.log(`🤖 Auto-resposta enviada para +${cleanDigits}: ${res.status}`);
  } catch (e) {
    console.error('Erro na auto-resposta:', e.message);
  }
}

function processIncomingMessage(sessionId, data) {
  const payload = data.data || data.payload || data;
  if (!payload || payload.fromMe || payload.isGroupMsg) return;

  const bodyText = (payload.body || payload.text || payload.caption || '').trim();
  const fromJid = payload.from || payload.chatId || '';
  const senderPhone = fromJid.replace(/\D/g, '');
  const pushName = payload.sender?.pushname || payload.sender?.name || senderPhone;
  const chipInfo = SESSIONS[sessionId] || { name: `Sessão ${sessionId.slice(0, 8)}` };

  if (!bodyText || !senderPhone) return;

  console.log(`\n📩 [WEBHOOK RECEBIDO - ${chipInfo.name}]`);
  console.log(`👤 De: ${pushName} (+${senderPhone})`);
  console.log(`💬 Mensagem: "${bodyText}"`);

  // 1. Notifica via Telegram
  sendTelegram(`📩 *Nova Resposta no WhatsApp!*\n\n📱 *Canal:* ${chipInfo.name}\n👤 *Lead:* ${pushName} (\`+${senderPhone}\`)\n💬 *Mensagem:* _"${bodyText}"_`);

  const lower = bodyText.toLowerCase();

  // 2. Regras de Resposta Automática Inteligente
  if (lower.includes('nao se encontra') || lower.includes('nao esta') || lower.includes('ausente')) {
    sendWhatsAppReply(sessionId, senderPhone, 'Tranquilo! Sabe me dizer qual o melhor horário para eu retornar o contato com ele? Ou se ele tem algum número direto por aqui?');
  } else if (lower === 'nao' || lower === 'nao sou eu' || lower.includes('numero errado') || lower.includes('nao e esse')) {
    sendWhatsAppReply(sessionId, senderPhone, 'Ah tranquilo! Desculpe o engano. Boa tarde! 👍');
  } else if (lower.includes('como funciona') || lower.includes('qual valor') || lower.includes('quais os valores') || lower.includes('tenho interesse') || lower.includes('manda o link') || lower.includes('me manda')) {
    sendWhatsAppReply(sessionId, senderPhone, `Desenvolvemos páginas e catálogos digitais de alta conversão específicos para o segmento, com botão direto pro WhatsApp. Dá uma olhada no modelo: https://flora-agri-drones.vercel.app/ - Me diz o que achou!`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        const sessionId = req.headers['x-session-id'] || json.sessionId || json.session || '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
        processIncomingMessage(sessionId, json);
      } catch (e) {
        // Ignora JSON inválido
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Webhook Auto-Responder Active');
  }
});

server.listen(PORT, () => {
  console.log(`⚡ Servidor Webhook Auto-Responder ouvindo na porta ${PORT}...`);
});
