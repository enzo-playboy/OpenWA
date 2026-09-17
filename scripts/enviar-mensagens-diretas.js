const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

const CHIP_1_SESSION = '84e58e30-9c99-4eb5-8e27-c6604778d1cd'; // suportew
const CHIP_2_SESSION = '764ba619-c986-4b7b-bea8-fa67c2845b01'; // chip-2-iphone

async function sendText(sessionId, rawPhone, text) {
  const cleanDigits = rawPhone.replace(/\D/g, '');
  const jid = `${cleanDigits}@s.whatsapp.net`;

  console.log(`📤 Enviando para ${cleanDigits} via sessão ${sessionId}...`);

  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages/send-text`, {
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
    console.log(`✅ Sucesso para ${cleanDigits}!`);
  } else {
    const err = await res.text();
    console.error(`❌ Erro no envio para ${cleanDigits} (${res.status}):`, err);
  }
}

async function main() {
  // 1. Miguel Arthur / DroneReparo - Telefone exato: 556592821288
  const textMiguel = `Fala Miguel, boa tarde!

Desenvolvemos catálogos digitais interativos específicos para empresas de drones que substituem o PDF e convertem direto no WhatsApp:
https://flora-agri-drones.vercel.app/

Dá uma olhadinha no modelo e me diz o que achou!`;

  await sendText(CHIP_2_SESSION, '556592821288', textMiguel);

  // 2. Caroline Financeiro / Pet Rações - Telefone exato: 556592841667
  const textCaroline = `Olá Caroline, boa tarde! Me passaram seu contato da equipe da Pet Rações.

Trabalhamos com desenvolvimento de catálogos digitais e sites de alta conversão para petshops e lojas de ração, com catálogo completo e botão direto pro WhatsApp.

Como funciona a exibição dos produtos de vocês hoje para os clientes?`;

  await sendText(CHIP_1_SESSION, '556592841667', textCaroline);
}

main();
