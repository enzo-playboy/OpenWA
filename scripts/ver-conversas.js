const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;
delete process.env.ALL_PROXY;
delete process.env.all_proxy;

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

const SESSIONS = [
  { id: '764ba619-c986-4b7b-bea8-fa67c2845b01', name: 'chip-2-iphone (Ouro & Joias)', phone: '556593455291' },
  { id: '84e58e30-9c99-4eb5-8e27-c6604778d1cd', name: 'suportew (Agro & Drones)', phone: '556596466243' }
];

async function fetchRecentMessages(sessionId, limit = 20) {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages?limit=${limit}`, {
      headers: { 'x-api-key': API_KEY }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    console.error(`Erro ao puxar mensagens da sessão ${sessionId}:`, err.message);
    return [];
  }
}

async function main() {
  console.log('============ 📲 MONITOR DE CONVERSAS REAL-TIME (OPENWA) ============');
  console.log(`Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`);

  for (const session of SESSIONS) {
    console.log(`--- [ CHIP: ${session.name} ] ---`);
    const msgs = await fetchRecentMessages(session.id, 30);

    // Agrupa por conversa (chatId)
    const chatsMap = new Map();
    for (const msg of msgs) {
      if (!chatsMap.has(msg.chatId)) {
        chatsMap.set(msg.chatId, []);
      }
      chatsMap.get(msg.chatId).push(msg);
    }

    if (chatsMap.size === 0) {
      console.log('Nenhuma mensagem recente encontrada.\n');
      continue;
    }

    for (const [chatId, chatMsgs] of chatsMap.entries()) {
      // Ordena por timestamp
      chatMsgs.sort((a, b) => a.timestamp - b.timestamp);
      const phone = chatId.replace('@c.us', '');
      const lastMsg = chatMsgs[chatMsgs.length - 1];
      const chatName = chatMsgs.find(m => m.chatName)?.chatName || phone;

      console.log(`📌 Conversa: ${chatName} (${phone}) | Direção: ${lastMsg.direction}`);
      for (const m of chatMsgs.slice(-5)) { // mostra as últimas 5 da conversa
        const hora = new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const sender = m.direction === 'incoming' ? '👤 Cliente' : '🤖 Você';
        const text = m.body ? m.body.replace(/\n/g, ' ') : '[Mídia/Sem texto]';
        console.log(`   [${hora}] ${sender}: ${text}`);
      }
      console.log('');
    }
  }
  console.log('===================================================================');
}

main();
