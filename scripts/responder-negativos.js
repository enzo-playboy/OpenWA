const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

const CHIP_1 = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const CHIP_2 = '764ba619-c986-4b7b-bea8-fa67c2845b01';

async function sendMsg(sessionId, phone, text) {
  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages/send-text`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: jid, text })
  });
  console.log(`Envio para ${phone} via ${sessionId}: Status ${res.status}`);
}

async function main() {
  console.log('💬 Enviando respostas de cortesia...');
  await sendMsg(CHIP_2, '5511981230950', 'Ah, tranquilo! Desculpa o engano. Boa tarde! 🙏');
  await sendMsg(CHIP_1, '554498762079', 'Ah tranquilo! Desculpe o engano. Boa tarde! 👍');
  await sendMsg(CHIP_1, '553498762173', 'Sem problemas, desculpe o incomodo! Boa tarde! 🙏');
  console.log('✅ Respostas enviadas com sucesso!');
}

main();
