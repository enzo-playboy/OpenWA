const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendOneLead(leadNumber) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  console.log(`\n🔍 [LEAD #${leadNumber}] Buscando lead pendente no WhatsApp...`);

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
        console.log(`✅ [LEAD #${leadNumber}] Encontrado: ${lead.name} (${lead.phone}) -> JID: ${targetJid}`);
        break;
      }
    } catch (e) {
      console.log(`Erro ao verificar ${lead.phone}:`, e.message);
    }
  }

  if (!targetLead || !targetJid) {
    console.error(`❌ [LEAD #${leadNumber}] Nenhum lead pendente válido encontrado.`);
    return false;
  }

  const leadName = targetLead.name;
  const leadPhone = targetLead.phone;
  const rawData = targetLead.metadata?.raw_data || {};
  const cidade = rawData.personCity || rawData.city || 'sua cidade';
  const estado = rawData.personState || rawData.state || '';

  const text = `Oi, tudo bem? Vi vocês no Google.\n\nNotei que a ${leadName} ainda não tem um site próprio. Isso acaba fazendo a loja perder algumas vendas pra concorrência hoje em dia.\n\nNós criamos sites rápidos e profissionais (na faixa de até R$ 400). Posso montar uma prévia rapidinho pra vocês verem como ficaria, sem compromisso?`;

  console.log(`🚀 [LEAD #${leadNumber}] Enviando mensagem de Site Rápido para: ${leadName} (${targetJid})...`);

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
  console.log(`STATUS [LEAD #${leadNumber}]:`, sendRes.status);
  console.log(`RESULTADO DO ENVIO [LEAD #${leadNumber}]:`, JSON.stringify(result, null, 2));

  if (sendRes.ok) {
    console.log(`🔄 Atualizando Supabase [LEAD #${leadNumber}]...`);
    await fetch(supabaseUrl + '/rest/v1/leads?id=eq.' + targetLead.id, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'contacted', current_step: 1 })
    });

    const now = new Date().toLocaleString('pt-BR');
    let existing = fs.readFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', 'utf8');

    const novoLeadInfo = `
---

### 💎 ${leadName} (${cidade} - ${estado})
- **Telefone / WhatsApp:** \`+${leadPhone}\` (JID: \`${targetJid}\`)
- **Endereço:** ${rawData.address || cidade}
- **Status:** 📤 **Mensagem 1 Enviada (Foco: Site Rápido / Até R$ 400)**
- **Possui Site:** ❌ Não
- **Data de Envio:** ${now}
- **Mensagem Enviada:**
  > *"Oi, tudo bem? Vi vocês no Google. Notei que a ${leadName} ainda não tem um site próprio. Isso acaba fazendo a loja perder algumas vendas pra concorrência hoje em dia. Nós criamos sites rápidos e profissionais (na faixa de até R$ 400). Posso montar uma prévia rapidinho pra vocês verem como ficaria, sem compromisso?"*
`;

    existing = existing.replace('## 📊 Resumo do Status no Supabase', novoLeadInfo + '\n## 📊 Resumo do Status no Supabase');
    fs.writeFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', existing);
    console.log(`✅ [LEAD #${leadNumber}] Log do Obsidian atualizado com sucesso!`);
    return true;
  }
  return false;
}

async function startScheduledSequence() {
  // Delays in minutes para os próximos 10 leads (o primeiro é imediato - 0)
  const delaysEmMinutos = [0, 15, 35, 20, 25, 18, 30, 22, 15, 28];

  console.log(`⏳ Agendador iniciado para ${delaysEmMinutos.length} leads! (${new Date().toLocaleTimeString('pt-BR')})`);

  for (let i = 0; i < delaysEmMinutos.length; i++) {
    const minutos = delaysEmMinutos[i];
    const waitMs = minutos * 60 * 1000;

    if (waitMs > 0) {
      console.log(`\n⏳ Aguardando ${minutos} minutos para disparar o LEAD #${i + 1}...`);
      await sleep(waitMs);
    }

    console.log(`\n⏰ Disparando LEAD #${i + 1} agora! (${new Date().toLocaleTimeString('pt-BR')})`);
    const success = await sendOneLead(i + 1);
    
    if (!success) {
      console.log(`⚠️ Falha ao processar o LEAD #${i + 1}. O agendador continuará para o próximo no tempo estipulado.`);
    }
  }

  console.log(`🎉 Sequência de ${delaysEmMinutos.length} disparos concluída com sucesso! (${new Date().toLocaleTimeString('pt-BR')})`);
}

startScheduledSequence();
