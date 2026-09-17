const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';
const CHIP_2_SESSION = '764ba619-c986-4b7b-bea8-fa67c2845b01';

async function main() {
  const phone = '5565992821288';
  const jid = `${phone}@s.whatsapp.net`;
  const text = `Fala Miguel, boa tarde! Prazer!

Trabalhamos exatamente no desenvolvimento de catálogos e sites de alta conversão para empresas de drones e manutenção.

O grande problema do PDF é que muitos clientes acham pesado para abrir no celular ou acabam não olhando a lista completa. Com um catálogo/site interativo, você apresenta seus serviços, peças e modelos de forma limpa, com botões diretos de atendimento e automação para o WhatsApp.

Dá uma olhada no modelo que desenvolvemos para esse segmento de drones:
https://flora-agri-drones.vercel.app/

Se fizer sentido para a DroneReparo, conseguimos estruturar uma versão exclusiva para vocês.`;

  console.log(`📤 Enviando proposta profissional para Miguel Arthur / DroneReparo (+${phone})...`);

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
    console.log('✅ Proposta enviada com SUCESSO para Miguel Arthur!');
  } else {
    const err = await res.text();
    console.error(`❌ Erro no envio (${res.status}):`, err);
  }
}

main();
