const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

async function unpauseAll() {
  console.log('🔓 Unpausing all chats for Sofia AI...');
  const res = await fetch(`${BASE_URL}/ai-agent/chats/paused`, {
    method: 'DELETE',
    headers: { 'x-api-key': API_KEY }
  });
  if (res.ok) {
    const data = await res.json();
    console.log('✅ Sofia AI chats despausados com sucesso! Removidos:', data.cleared);
  } else {
    console.error('❌ Erro ao despausar:', res.status);
  }
}

unpauseAll();
