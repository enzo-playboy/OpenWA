const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendFollowup() {
  const targetJid = '556599719591@c.us'; // Master Jóias
  // Treinamento SDR (Regras 5 e 7): follow-up com valor novo, sem cobrança, terminando com pergunta.
  const text = 'Oi! Separei um exemplo de catálogo online pra você ver como ficaria na Master Jóias. Quer dar uma olhada?';

  // Calcular milissegundos até as 17:40
  const now = new Date();
  const target = new Date();
  target.setHours(17, 40, 0, 0);

  let delayMs = target.getTime() - now.getTime();
  if (delayMs < 0) {
    delayMs = 0; // Se já passou das 17:40, envia imediatamente
  }

  console.log(`⏳ Follow-up agendado para as 17:40 (em aproximadamente ${Math.round(delayMs / 60000)} minutos)...`);
  await sleep(delayMs);

  console.log(`⏰ Horário das 17:40 atingido! Enviando follow-up para Master Jóias (${targetJid})...`);

  const sendRes = await fetch(BASE_URL + '/sessions/' + SESSION_ID + '/messages/send-text', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chatId: targetJid,
      text: text
    })
  });

  const result = await sendRes.json();
  console.log('STATUS:', sendRes.status);
  console.log('RESULTADO DO ENVIO:', JSON.stringify(result, null, 2));

  if (sendRes.ok) {
    console.log('✅ Follow-up das 17:40 enviado com sucesso!');
  }
}

sendFollowup();
