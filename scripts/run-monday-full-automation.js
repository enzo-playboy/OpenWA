const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para gerar delay aleatório entre min (minutos) e max (minutos)
function getRandomDelayMs(minMinutes, maxMinutes) {
  const minMs = minMinutes * 60 * 1000;
  const maxMs = maxMinutes * 60 * 1000;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function sendOneLead(batchName, index, total) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  console.log(`\n🔍 [${batchName} - Lead ${index}/${total}] Buscando próximo lead pendente...`);

  try {
    const res = await fetch(supabaseUrl + '/rest/v1/leads?select=*&status=eq.pending&order=created_at.desc', {
      headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
    });
    const leads = await res.json();

    let targetLead = null;
    let targetJid = null;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      await sleep(200);

      try {
        const checkRes = await fetch(BASE_URL + '/sessions/' + SESSION_ID + '/contacts/check/' + lead.phone, {
          headers: { 'x-api-key': API_KEY }
        });
        if (!checkRes.ok) continue;
        const result = await checkRes.json();
        if (result.exists && result.whatsappId) {
          targetLead = lead;
          targetJid = result.whatsappId;
          console.log(`✅ [${batchName}] Encontrado: ${lead.name} (${lead.phone}) -> JID: ${targetJid}`);
          break;
        }
      } catch (e) {
        console.log(`⚠️ Erro ao checar ${lead.phone}:`, e.message);
      }
    }

    if (!targetLead || !targetJid) {
      console.log(`⚠️ [${batchName}] Nenhum lead pendente válido restava na base.`);
      return false;
    }

    const leadName = targetLead.name;
    const leadPhone = targetLead.phone;
    const rawData = targetLead.metadata?.raw_data || {};
    const cidade = rawData.personCity || rawData.city || 'sua cidade';
    const estado = rawData.personState || rawData.state || '';

    const text = `Oi! Tudo bem?\n\nPesquisei por joalherias no Google e encontrei o perfil da ${leadName}.\n\nVocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?`;

    console.log(`🚀 [${batchName}] Enviando para: ${leadName} (${targetJid})...`);

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

    const status = sendRes.status;
    const result = await sendRes.json();
    console.log(`STATUS: ${status}`);

    if (sendRes.ok) {
      // Atualiza Supabase
      await fetch(supabaseUrl + '/rest/v1/leads?id=eq.' + targetLead.id, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: 'Bearer ' + supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'contacted', current_step: 1 })
      });

      // Atualiza Obsidian
      const now = new Date().toLocaleString('pt-BR');
      let existing = fs.readFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', 'utf8');

      const novoLeadInfo = `
---

### 💎 ${leadName} (${cidade} - ${estado})
- **Telefone / WhatsApp:** \`+${leadPhone}\` (JID: \`${targetJid}\`)
- **Endereço:** ${rawData.address || cidade}
- **Status:** 📤 **Mensagem 1 Enviada (Foco: Site/Catálogo)**
- **Possui Site:** ❌ Não
- **Data de Envio:** ${now} (${batchName})
- **Mensagem Enviada:**
  > *"Oi! Tudo bem? Pesquisei por joalherias no Google e encontrei o perfil da ${leadName}. Vocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?"*
`;

      existing = existing.replace('## 📊 Resumo do Status no Supabase', novoLeadInfo + '\n## 📊 Resumo do Status no Supabase');
      fs.writeFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', existing);
      console.log(`✅ [${batchName}] Sucesso! Lead registrado no Obsidian.`);
      return true;
    }
  } catch (err) {
    console.error(`❌ Erro no envio [${batchName}]:`, err.message);
  }
  return false;
}

async function runBatch(batchName, count, minDelayMin, maxDelayMin) {
  console.log(`\n========================================`);
  console.log(`🚀 INICIANDO ${batchName.toUpperCase()} (${count} Disparos | Delay Anti-Ban: ${minDelayMin}-${maxDelayMin} min)`);
  console.log(`========================================\n`);

  for (let i = 1; i <= count; i++) {
    const success = await sendOneLead(batchName, i, count);
    if (!success) {
      console.log(`⚠️ Interrompendo ${batchName} pois não há mais leads pendentes.`);
      break;
    }

    if (i < count) {
      const delayMs = getRandomDelayMs(minDelayMin, maxDelayMin);
      const delayMinutesStr = (delayMs / (60 * 1000)).toFixed(1);
      console.log(`⏳ [Anti-Ban] Pausando por ${delayMinutesStr} minutos antes do próximo envio...`);
      await sleep(delayMs);
    }
  }
  console.log(`\n✅ ${batchName} finalizado com sucesso!`);
}

async function waitUntilTime(targetHour, targetMinute) {
  while (true) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    if (currentHour > targetHour || (currentHour === targetHour && currentMin >= targetMinute)) {
      break;
    }

    console.log(`⏳ Aguardando horário de disparo: ${targetHour.toString().padStart(2, '0')}:${targetMinute.toString().padStart(2, '0')} (Horário atual: ${now.toLocaleTimeString('pt-BR')})`);
    await sleep(60 * 1000); // Checa a cada 1 minuto
  }
}

async function startFullMondayAutomation() {
  console.log(`🤖 Agendador Automático da Segunda-Feira Iniciado!`);
  console.log(`Data/Hora Atual: ${new Date().toLocaleString('pt-BR')}`);

  // 1. Aguarda 08:00 para LOTE 1 (Manhã)
  await waitUntilTime(8, 0);
  await runBatch('Lote 1 (Manhã)', 12, 5, 12);

  // 2. Aguarda 13:30 para LOTE 2 (Tarde 1)
  await waitUntilTime(13, 30);
  await runBatch('Lote 2 (Tarde 1)', 12, 6, 15);

  // 3. Aguarda 16:30 para LOTE 3 (Tarde 2)
  await waitUntilTime(16, 30);
  await runBatch('Lote 3 (Tarde 2)', 12, 8, 15);

  console.log(`🎉 TODOS OS LOTES DA SEGUNDA-FEIRA FORAM EXECUTADOS COM SUCESSO!`);
}

startFullMondayAutomation();
