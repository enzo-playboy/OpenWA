const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';
const CHIP_2_SESSION = '764ba619-c986-4b7b-bea8-fa67c2845b01';

async function sendMsg(phone) {
  const jid = `${phone}@s.whatsapp.net`;
  const text = `Boa tarde!

Desenvolvemos catálogos digitais e páginas de alta conversão específicas para empresas de pulverização com drones, organizando seus serviços e orçamento direto no WhatsApp:
https://flora-agri-drones.vercel.app/

Dá uma olhadinha no modelo e me diz o que achou!`;

  console.log(`📤 Enviando proposta para Pulverizar Drones (+${phone})...`);

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
    console.log(`✅ Sucesso para +${phone}!`);
  } else {
    const err = await res.text();
    console.error(`❌ Erro no envio (${res.status}):`, err);
  }
}

async function main() {
  await sendMsg('5591991149328');
  await sendMsg('559191149328');
}

main();
