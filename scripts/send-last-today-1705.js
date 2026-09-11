const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendLastLead() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  // Calcular milissegundos até as 17:05
  const now = new Date();
  const target = new Date();
  target.setHours(17, 5, 0, 0);

  let delayMs = target.getTime() - now.getTime();
  if (delayMs < 0) {
    delayMs = 0;
  }

  console.log(`⏳ Agendado o ÚLTIMO disparo de hoje para as 17:05 (em ~${Math.round(delayMs / 60000)} minutos)...`);
  await sleep(delayMs);

  console.log(`⏰ Horário das 17:05 atingido! Buscando o próximo lead pendente no WhatsApp...`);

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
        console.log(`✅ ÚLTIMO LEAD DE HOJE ENCONTRADO: ${lead.name} (${lead.phone}) -> JID: ${targetJid}`);
        break;
      }
    } catch (e) {
      console.log(`Erro ao verificar ${lead.phone}:`, e.message);
    }
  }

  if (!targetLead || !targetJid) {
    console.error('❌ Nenhum lead pendente válido encontrado.');
    return;
  }

  const leadName = targetLead.name;
  const leadPhone = targetLead.phone;
  const rawData = targetLead.metadata?.raw_data || {};
  const cidade = rawData.personCity || rawData.city || 'sua cidade';
  const estado = rawData.personState || rawData.state || '';

  const text = `Oi! Tudo bem?\n\nPesquisei por joalherias no Google e encontrei o perfil da ${leadName}.\n\nVocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?`;

  console.log(`🚀 Enviando mensagem de Site/Catálogo para: ${leadName} (${targetJid})...`);

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
    console.log('🔄 Atualizando Supabase...');
    await fetch(supabaseUrl + '/rest/v1/leads?id=eq.' + targetLead.id, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'contacted', current_step: 1 })
    });

    const nowStr = new Date().toLocaleString('pt-BR');
    let existing = fs.readFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', 'utf8');

    const novoLeadInfo = `
---

### 💎 ${leadName} (${cidade} - ${estado})
- **Telefone / WhatsApp:** \`+${leadPhone}\` (JID: \`${targetJid}\`)
- **Endereço:** ${rawData.address || cidade}
- **Status:** 📤 **Mensagem 1 Enviada (Foco: Site/Catálogo)**
- **Possui Site:** ❌ Não
- **Data de Envio:** ${nowStr}
- **Mensagem Enviada:**
  > *"Oi! Tudo bem? Pesquisei por joalherias no Google e encontrei o perfil da ${leadName}. Vocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?"*
`;

    existing = existing.replace('## 📊 Resumo do Status no Supabase', novoLeadInfo + '\n## 📊 Resumo do Status no Supabase');
    fs.writeFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', existing);
    console.log('✅ [17:05] Último disparo do dia e Obsidian atualizados com sucesso!');
  }
}

sendLastLead();
