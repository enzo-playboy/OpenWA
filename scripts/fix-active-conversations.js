const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';
const SUPORTEW_SESSION = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';

async function sendMsg(phone, text) {
  const cleanDigits = phone.replace(/\D/g, '');
  const jid = `${cleanDigits}@s.whatsapp.net`;
  console.log(`📤 Enviando resposta para +${cleanDigits}...`);
  const res = await fetch(`${BASE_URL}/sessions/${SUPORTEW_SESSION}/messages/send-text`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: jid, text })
  });
  const data = await res.json();
  console.log(`Status: ${res.status}`, data);
  return data;
}

async function main() {
  console.log('🚀 NUTRINDO E CORRIGINDO CONVERSAS ATIVAS NO SUPORTEW...\n');

  // 1. Resposta para Agro Estufa Agrícola
  console.log('1️⃣ Respondendo assistente da Agro Estufa Agrícola (+55 64 9259-0571)...');
  await sendMsg(
    '556492590571',
    'Olá! Perfeito! O objetivo do nosso contato é justamente apresentar uma proposta para criação do site e catálogo digital oficial da Agro Estufa Agrícola.\n\nHoje muitos produtores buscam no Google por estufas e irrigação antes de chamar no WhatsApp, e ter um portal próprio passa muito mais autoridade e gera cotações qualificadas pra vocês. Quem da direção ou comercial cuida dessa parte pra apresentarmos um modelo?'
  );

  // Rigor anti-ban (AGENTS.md): 1-2 min entre respostas no mesmo chip.
  await new Promise(r => setTimeout(r, 60_000 + Math.random() * 60_000));

  // 2. Esclarecimento para Drone Cuiabá
  console.log('2️⃣ Esclarecendo mensagem para Drone Cuiabá (+55 65 9286-2100)...');
  await sendMsg(
    '556592862100',
    'Opa Luis! Desculpa a mensagem repetida de hoje cedo, acabou entrando na nossa fila de disparo por engano! 🙏\n\nComo a gente conversou ontem, o objetivo é apresentar a proposta de site/catálogo profissional para a Drone Cuiabá se posicionar com destaque. Deu uma olhadinha no modelo que te enviei ontem (https://flora-agri-drones.vercel.app/)?'
  );

  console.log('\n✅ Conversas atualizadas com sucesso!');
}

main();
