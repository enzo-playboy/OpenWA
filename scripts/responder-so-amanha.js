const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';
const CHIP_1_SESSION = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';

async function main() {
  const phone = '556599030338';
  const jid = `${phone}@s.whatsapp.net`;
  const text = 'Maravilha! Muito obrigado. Amanhã de manhã retorno o contato então. Boa tarde e ótimo trabalho por aí! 👍';

  console.log(`📤 Enviando resposta para Tendi Tudo Agropet (+${phone})...`);

  const res = await fetch(`${BASE_URL}/sessions/${CHIP_1_SESSION}/messages/send-text`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: jid, text })
  });

  if (res.ok) {
    console.log('✅ Resposta enviada com SUCESSO para Tendi Tudo Agropet!');
  } else {
    const err = await res.text();
    console.error(`❌ Erro no envio (${res.status}):`, err);
  }
}

main();
