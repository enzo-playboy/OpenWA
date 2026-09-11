const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://localhost:2785/api';

async function sendFirstLead() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  const leadId = '9ec55f7e-a382-44a3-9826-ffefc1d40fb3';
  const leadName = 'Mylla Joias';
  const leadPhone = '5567991109979';
  const targetJid = '556791109979@c.us';
  const cidade = 'Campo Grande';
  const estado = 'MS';

  const text = 'Oi! Tudo bem?\n\nPesquisei por joalherias no Google e encontrei o perfil da Mylla Joias em Campo Grande.\n\nVocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?';

  console.log('🚀 Enviando mensagem focada em SITE para:', leadName, targetJid);

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

  if (sendRes.ok) {
    console.log('🔄 Atualizando Supabase...');
    await fetch(supabaseUrl + '/rest/v1/leads?id=eq.' + leadId, {
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

### 💎 17. ${leadName} (${cidade} - ${estado})
- **Telefone / WhatsApp:** \`+${leadPhone}\` (JID: \`${targetJid}\`)
- **Endereço:** Campo Grande - MS
- **Status:** 📤 **Mensagem 1 Enviada (Foco: Site/Catálogo)**
- **Possui Site:** ❌ Não
- **Data de Envio:** ${now}
- **Mensagem Enviada:**
  > *"Oi! Tudo bem? Pesquisei por joalherias no Google e encontrei o perfil da Mylla Joias em Campo Grande. Vocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?"*
`;

    existing = existing.replace('## 📊 Resumo do Status no Supabase', novoLeadInfo + '\n## 📊 Resumo do Status no Supabase');
    fs.writeFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', existing);
    console.log('✅ Log do Obsidian atualizado com sucesso!');
  }
}

sendFirstLead();
