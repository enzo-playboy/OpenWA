const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';
const CHIP_2_SESSION = '764ba619-c986-4b7b-bea8-fa67c2845b01';

async function main() {
  const phone = '5565992821288';
  const jid = `${phone}@s.whatsapp.net`;
  const text = `Fala Miguel, boa tarde!

Desenvolvemos um catálogo interativo rápido específico para empresas de drones, que substitui o PDF e converte direto no WhatsApp:
https://flora-agri-drones.vercel.app/

Dá uma olhadinha no modelo e me diz o que achou!`;

  console.log(`📤 Enviando mensagem curta e direta para Miguel Arthur (+${phone})...`);

  const res = await fetch(`${BASE_URL}/sessions/${CHIP_2_SESSION}/messages/send-text`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chatId: jid,
      text: text
    })
  });

  if (res.ok) {
    console.log('✅ Mensagem curta enviada com SUCESSO!');
  } else {
    const err = await res.text();
    console.error(`❌ Erro no envio (${res.status}):`, err);
  }
}

main();
