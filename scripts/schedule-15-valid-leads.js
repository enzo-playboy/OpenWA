const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';
const CLIENTS_DIR = 'e:/prosp/OpenWA/clientes';

const MESSAGES = [
  "Oi {Empresa}! Vi o Google de vocês. Posso montar uma prévia de site rapidinho pra vocês verem?",
  "Olá {Empresa}! Vocês perdem vendas por não ter site. Querem ver uma prévia que eu posso montar?",
  "Oi {Empresa}, tudo bem? Vi o Google de vocês, consigo falar rapidinho com o responsável?"
];

// O cronograma original, os horários que já passaram serão ajustados para "agora".
const SCHEDULE_TIMES = [
  '10:01', '10:30', '10:50', '11:15', '11:40', '12:00',
  '13:30', '13:50', '14:20', '14:50', '15:20', '15:50',
  '16:20', '16:50', '17:15'
];

async function checkWhatsAppValid(phone) {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/contacts/check/${phone}`, {
      headers: { 'x-api-key': API_KEY }
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.exists ? json.whatsappId : null;
  } catch (e) {
    return null;
  }
}

async function sendMsg(jid, text, name) {
  try {
    console.log(`\n[🚀 ENVIANDO] -> ${name}`);
    const res = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages/send-text`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: jid, text: text })
    });
    if (res.ok) {
      console.log(`✅ Sucesso no disparo para ${name}!`);
    } else {
      console.log(`⚠️ Falha para ${name}. Status: ${res.status}`);
    }
  } catch(e) {
    console.log(`❌ Erro no envio para ${name}:`, e.message);
  }
}

function parseTime(timeStr, index) {
  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  
  let delayMs = target.getTime() - Date.now();
  // Se o horário já passou, ajustamos para rodar em sequencia daqui a poucos minutos
  if (delayMs < 0) {
    delayMs = (index + 1) * 2 * 60000; // a cada 2 minutos os que já passaram
  }
  return delayMs;
}

async function find15ValidLeadsAndSchedule() {
  console.log("🔍 Escaneando pasta de clientes em busca de 15 leads com WhatsApp válido...");
  const files = fs.readdirSync(CLIENTS_DIR).filter(f => f.endsWith('.md'));
  
  const validLeads = [];
  
  for (let file of files) {
    if (validLeads.length >= 15) break;
    
    const content = fs.readFileSync(path.join(CLIENTS_DIR, file), 'utf8');
    const phoneMatch = content.match(/telefone:\s*"([^"]+)"/);
    const nameMatch = content.match(/empresa:\s*"([^"]+)"/);
    
    if (phoneMatch && nameMatch) {
      let phone = phoneMatch[1].replace(/\D/g, '');
      const name = nameMatch[1];
      
      // Pula telefone que notoriamente é fixo
      if (phone.length === 12 && phone.startsWith('55') && ['2','3','4','5'].includes(phone[4])) {
        continue;
      }
      
      const wuid = await checkWhatsAppValid(phone);
      if (wuid) {
        console.log(`✅ ${name} (${phone}) - OK no WhatsApp!`);
        validLeads.push({ name, jid: wuid });
      }
    }
  }

  if (validLeads.length === 0) {
    console.log("❌ Nenhum lead válido encontrado!");
    return;
  }
  
  console.log(`\n🎉 Encontrados ${validLeads.length} leads válidos! Iniciando o cronograma...\n`);

  validLeads.forEach((lead, index) => {
    // Escolhe mensagem intercalada
    let rawMsg = MESSAGES[index % 3];
    let finalMsg = rawMsg.replace('{Empresa}', lead.name);
    
    // Pega o horário definido, ou usa o último da lista se faltar
    const timeStr = SCHEDULE_TIMES[index] || SCHEDULE_TIMES[SCHEDULE_TIMES.length - 1];
    
    const delay = parseTime(timeStr, index);
    const timeToRun = new Date(Date.now() + delay).toLocaleTimeString('pt-BR');
    
    console.log(`⏰ Agendado: ${lead.name} | Para: ${timeToRun} | MSG: Opção ${index%3 + 1}`);
    
    setTimeout(() => {
      sendMsg(lead.jid, finalMsg, lead.name);
    }, delay);
  });
}

find15ValidLeadsAndSchedule();
