const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

const CHIP_2_SESSION = '764ba619-c986-4b7b-bea8-fa67c2845b01';

async function main() {
  const phone = '5577999860123';
  const jid = `${phone}@s.whatsapp.net`;
  const text = 'Show! 😁 Na verdade queria tirar uma dúvida rápida: vocês hoje atendem os clientes só por aqui no WhatsApp mesmo, ou já têm um site próprio com a lista de serviços e peças de manutenção?';

  console.log(`📤 Enviando resposta para Manutenção em Drones em Geral (+${phone})...`);

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
    console.log('✅ Resposta enviada com SUCESSO!');
  } else {
    const err = await res.text();
    console.error(`❌ Erro no envio (${res.status}):`, err);
  }
}

main();
