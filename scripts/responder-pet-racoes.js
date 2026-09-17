const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';
const CHIP_1_SESSION = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';

async function main() {
  const phone = '556581120245';
  const jid = `${phone}@s.whatsapp.net`;
  const text = 'Boa tarde! Tudo bem? 😁 Queria tirar uma dúvida rápida: vocês hoje atendem o pessoal só direto por aqui no WhatsApp mesmo, ou já têm um site próprio ou catálogo online dos produtos e rações?';

  console.log(`📤 Enviando resposta para Pet Rações (+${phone})...`);

  const res = await fetch(`${BASE_URL}/sessions/${CHIP_1_SESSION}/messages/send-text`, {
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
    console.log('✅ Resposta enviada com SUCESSO para Pet Rações!');
  } else {
    const err = await res.text();
    console.error(`❌ Erro no envio (${res.status}):`, err);
  }
}

main();
