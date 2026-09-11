const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd'; // Pegando do log do terminal
const BASE_URL = 'http://127.0.0.1:2785/api';

const LEADS_PLAN = [
  { file: 'Alem_o_Rel_gios.md', name: 'Alemão Relógios', msg: 'Oi Alemão Relógios! Vi o Google de vocês. Posso montar uma prévia de site rapidinho pra vocês verem?', time: '10:15' },
  { file: 'Arte_do_Mato.md', name: 'Arte do Mato', msg: 'Olá Arte do Mato! Vocês perdem vendas por não ter site. Querem ver uma prévia que eu posso montar?', time: '10:30' },
  { file: 'Bibis_J_ias.md', name: 'Bibis Jóias', msg: 'Oi Bibis Jóias, tudo bem? Vi o Google de vocês, consigo falar rapidinho com o responsável?', time: '10:50' },
  { file: 'Carioca_J_ias_E_Rel_gios.md', name: 'Carioca Jóias e Relógios', msg: 'Oi Carioca Jóias e Relógios! Vi o Google de vocês. Posso montar uma prévia de site rapidinho pra vocês verem?', time: '11:15' },
  { file: 'Cl_cia_Rel_gios.md', name: 'Clécia Relógios', msg: 'Olá Clécia Relógios! Vocês perdem vendas por não ter site. Querem ver uma prévia que eu posso montar?', time: '11:40' },
  { file: 'Collier_Pedras_e_Prata.md', name: 'Collier Pedras e Prata', msg: 'Oi Collier Pedras e Prata, tudo bem? Vi o Google de vocês, consigo falar rapidinho com o responsável?', time: '12:00' },
  { file: 'D_Carlos_J_ias.md', name: 'D Carlos Jóias', msg: 'Oi D Carlos Jóias! Vi o Google de vocês. Posso montar uma prévia de site rapidinho pra vocês verem?', time: '13:30' },
  { file: 'D_Luca_Rel_gios.md', name: 'D Luca Relógios', msg: 'Olá D Luca Relógios! Vocês perdem vendas por não ter site. Querem ver uma prévia que eu posso montar?', time: '13:50' },
  { file: 'Daymon_Relojoaria_e__tica.md', name: 'Daymon Relojoaria e Ótica', msg: 'Oi Daymon Relojoaria e Ótica, tudo bem? Vi o Google de vocês, consigo falar rapidinho com o responsável?', time: '14:20' },
  { file: 'Di_Menezes__Rel_gios__.md', name: 'Di Menezes Relógios', msg: 'Oi Di Menezes Relógios! Vi o Google de vocês. Posso montar uma prévia de site rapidinho pra vocês verem?', time: '14:50' },
  { file: 'Drag_o_Assist_ncia_T_cnica.md', name: 'Dragão Assistência Técnica', msg: 'Olá Dragão Assistência Técnica! Vocês perdem vendas por não ter site. Querem ver uma prévia que eu posso montar?', time: '15:20' },
  { file: 'Egipcyus_Joalheiros.md', name: 'Egipcyus Joalheiros', msg: 'Oi Egipcyus Joalheiros, tudo bem? Vi o Google de vocês, consigo falar rapidinho com o responsável?', time: '15:50' },
  { file: 'Ennoive_Joias.md', name: 'Ennoive Joias', msg: 'Oi Ennoive Joias! Vi o Google de vocês. Posso montar uma prévia de site rapidinho pra vocês verem?', time: '16:20' },
  { file: 'Foto__tica_E_Relojoaria_Sorriso.md', name: 'Foto Ótica e Relojoaria Sorriso', msg: 'Olá Foto Ótica e Relojoaria Sorriso! Vocês perdem vendas por não ter site. Querem ver uma prévia que eu posso montar?', time: '16:50' },
  { file: 'Giudice_Relojoeiros.md', name: 'Giudice Relojoeiros', msg: 'Oi Giudice Relojoeiros, tudo bem? Vi o Google de vocês, consigo falar rapidinho com o responsável?', time: '17:15' }
];

async function sendMsg(phone, text, name) {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    console.log(`[🚀 ENVIANDO] -> ${name} (${cleanPhone})`);
    
    // Verifica whatsapp id
    const checkRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/contacts/check/${cleanPhone}`, {
      headers: { 'x-api-key': API_KEY }
    });
    const result = await checkRes.json();
    
    if (!result.exists || !result.whatsappId) {
      console.log(`❌ Número inválido no WhatsApp para: ${name}`);
      return;
    }
    
    // Dispara mensagem
    const sendRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages/send-text`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: result.whatsappId, text: text })
    });
    
    if (sendRes.ok) {
      console.log(`✅ Sucesso no disparo para ${name}!`);
    } else {
      console.log(`⚠️ Falha ao disparar para ${name}. Status: ${sendRes.status}`);
    }
  } catch(e) {
    console.log(`❌ Erro no fluxo para ${name}:`, e.message);
  }
}

function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return target.getTime() - now.getTime();
}

console.log("=== INICIANDO AGENDAMENTO DE 15 LEADS ===");

LEADS_PLAN.forEach(lead => {
  const mdPath = path.join('e:', 'prosp', 'OpenWA', 'clientes', lead.file);
  if (!fs.existsSync(mdPath)) {
    console.log(`⚠️ Arquivo não encontrado: ${lead.file}`);
    return;
  }
  
  const content = fs.readFileSync(mdPath, 'utf8');
  const phoneMatch = content.match(/telefone:\s*"([^"]+)"/);
  
  if (phoneMatch && phoneMatch[1]) {
    const phone = phoneMatch[1];
    let delayMs = parseTime(lead.time);
    
    // Se o horário já passou, ajusta para mandar daqui a 1 minuto pra não perder.
    if (delayMs < 0) delayMs = 60000; 

    console.log(`⏰ Agendado: ${lead.name} às ${lead.time} (Daqui a ${(delayMs / 60000).toFixed(1)} mins)`);
    
    setTimeout(() => {
      sendMsg(phone, lead.msg, lead.name);
    }, delayMs);
  } else {
    console.log(`⚠️ Telefone não encontrado em: ${lead.file}`);
  }
});
