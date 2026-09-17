const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';
const WEBHOOK_URL = 'http://127.0.0.1:2789/webhook';

const SESSIONS = [
  '84e58e30-9c99-4eb5-8e27-c6604778d1cd', // suportew
  '764ba619-c986-4b7b-bea8-fa67c2845b01'  // chip-2-iphone
];

async function main() {
  console.log(`🔗 Configurando Webhook (${WEBHOOK_URL}) em ambas as sessões...`);

  for (const sessionId of SESSIONS) {
    try {
      const res = await fetch(`${BASE_URL}/sessions/${sessionId}/webhook`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          events: ['message', 'message.create', 'messages.upsert']
        })
      });
      console.log(`Session ${sessionId.slice(0, 8)}: Webhook registration status ${res.status}`);
    } catch (e) {
      console.error(`Erro na sessão ${sessionId}:`, e.message);
    }
  }
}

main();
