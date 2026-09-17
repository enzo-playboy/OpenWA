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
  { id: '764ba619-c986-4b7b-bea8-fa67c2845b01', name: 'chip-2-iphone (Ouro & Joias)' },
  { id: '84e58e30-9c99-4eb5-8e27-c6604778d1cd', name: 'suportew (Agro & Drones)' }
];

const targetArg = process.argv[2];

if (!targetArg) {
  console.log('Uso: node scripts/ver-conversa-lead.js <telefone_ou_nome>');
  process.exit(1);
}

const cleanTarget = targetArg.replace(/\D/g, '');

async function fetchChatMessages(sessionId, chatId) {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages?chatId=${chatId}&limit=50`, {
      headers: { 'x-api-key': API_KEY }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    return [];
  }
}

async function fetchAllMessages(sessionId) {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages?limit=100`, {
      headers: { 'x-api-key': API_KEY }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    return [];
  }
}

async function main() {
  console.log(`🔎 BUSCANDO CONVERSA DE: "${targetArg}"...\n`);
  let found = false;

  for (const session of SESSIONS) {
    const msgs = await fetchAllMessages(session.id);
    const filtered = msgs.filter(m => {
      const phone = m.chatId.replace(/\D/g, '');
      const name = (m.chatName || '').toLowerCase();
      return (cleanTarget && phone.includes(cleanTarget)) || (targetArg && name.includes(targetArg.toLowerCase()));
    });

    if (filtered.length > 0) {
      found = true;
      filtered.sort((a, b) => a.timestamp - b.timestamp);
      const first = filtered[0];
      console.log(`=== 📱 SESSÃO: ${session.name} ===`);
      console.log(`Contact: ${first.chatName || 'Desconhecido'} (${first.chatId})\n`);
      for (const m of filtered) {
        const date = new Date(m.timestamp * 1000).toLocaleString('pt-BR');
        const sender = m.direction === 'incoming' ? '👤 CLIENTE' : '🤖 VOCÊ';
        console.log(`[${date}] ${sender}: ${m.body || '[Sem texto / Mídia]'}`);
      }
      console.log('--------------------------------------------------\n');
    }
  }

  if (!found) {
    console.log(`❌ Nenhuma conversa encontrada para "${targetArg}".`);
  }
}

main();
