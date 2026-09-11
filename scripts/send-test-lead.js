const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://localhost:2785/api';

async function execute() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  console.log('🔍 Buscando leads pendentes no Supabase e validando presença real no WhatsApp via Baileys API...');

  const res = await fetch(supabaseUrl + '/rest/v1/leads?select=*&status=eq.pending&order=created_at.desc', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
  });
  const leads = await res.json();

  let targetLead = null;
  let targetJid = null;

  for (const lead of leads) {
    try {
      const checkRes = await fetch(BASE_URL + '/sessions/' + SESSION_ID + '/contacts/check/' + lead.phone, {
        headers: { 'x-api-key': API_KEY }
      });
      if (!checkRes.ok) continue;
      const result = await checkRes.json();
      
      if (result.exists && result.whatsappId) {
        targetLead = lead;
        targetJid = result.whatsappId;
        console.log(`✅ Lead Confirmado no WhatsApp: ${lead.name} | JID real: ${targetJid}`);
        break;
      } else {
        console.log(`⚠️ Telefone ${lead.phone} (${lead.name}) não está ativo no WhatsApp. Pulando...`);
      }
    } catch (e) {
      // continua tentando
    }
  }

  if (!targetLead || !targetJid) {
    console.error('Nenhum lead com WhatsApp ativo encontrado.');
    return;
  }

  const leadName = targetLead.name;
  const leadPhone = targetLead.phone;
  const cidade = targetLead.metadata?.raw_data?.city || 'região';
  const estado = targetLead.metadata?.raw_data?.state || '';

  const text = 'Olá! Nesse número eu falo com o representante da ' + leadName + '?';

  console.log(`🚀 Enviando mensagem de teste para o 15º Lead VÁLIDO: ${leadName} (${targetJid})...`);

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
  console.log('STATUS:', status);
  console.log('RESULTADO DO ENVIO:', JSON.stringify(result, null, 2));

  // Update Supabase status
  if (supabaseUrl && supabaseKey) {
    console.log('🔄 Atualizando status do lead no Supabase...');
    await fetch(supabaseUrl + '/rest/v1/leads?id=eq.' + targetLead.id, {
      method: 'PATCH',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contacted', current_step: 1 })
    });
  }

  // Create/Update Obsidian Markdown Note
  const now = new Date().toLocaleString('pt-BR');
  let existing = fs.readFileSync('./LEADS_PROSPECTADOS_OBSIDIAN.md', 'utf8');
  
  const novoLeadInfo = `
---

### 💎 15. ${leadName} (${cidade} - ${estado})
- **Telefone / WhatsApp:** \`+${leadPhone}\` (JID: \`${targetJid}\`)
- **Endereço:** ${targetLead.metadata?.raw_data?.address || 'N/A'}
- **Status:** 📤 **Mensagem 1 Enviada (Aguardando Resposta)**
- **Possui Site:** ❌ Não
- **Data de Envio:** ${now}
- **Mensagem Enviada:**
  > *"Olá! Nesse número eu falo com o representante da ${leadName}?"*
`;

  existing = existing.replace('## 📊 Resumo do Status no Supabase', novoLeadInfo + '\n## 📊 Resumo do Status no Supabase');
  existing = existing.replace('Contatos Efetuados Hoje:** 14', 'Contatos Efetuados Hoje:** 15');
  
  fs.writeFileSync('./LEADS_PROSPECTADOS_OBSIDIAN.md', existing);
  console.log('✅ Arquivo LEADS_PROSPECTADOS_OBSIDIAN.md atualizado com sucesso!');
}

execute();
