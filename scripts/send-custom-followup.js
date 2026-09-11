const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';

async function sendCustomMessage() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  // Lead information for Marines Natel
  const leadName = 'Marines Natel';
  const leadPhone = '5511952287392'; // Clean format without +
  const targetJid = '5511952287392@c.us';

  // Custom message provided by user (cleaned up)
  const text = 'Oi! Tudo bem?\n\nPesquisei por imobiliária aqui no Google e vi o perfil da Marines Natel. Vi que vocês ainda não possuem um site próprio. Isso acaba fazendo a imobiliária perder algumas vendas pra concorrência hoje em dia. Nós criamos sites rápidos e profissionais (na faixa de até R$ 400). Posso montar uma prévia rapidinho pra vocês verem como ficaria, sem compromisso?\n\nGostaria de dar uma olhada?';

  console.log('🚀 Enviando mensagem personalizada para:', leadName, targetJid);

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
    console.log('🔄 Atualizando Supabase (incrementando current_step)...');
    await fetch(supabaseUrl + '/rest/v1/leads?id=eq.' + leadPhone, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ current_step: 2 }) // Increment to indicate second touchpoint
    });

    const now = new Date().toLocaleString('pt-BR');
    let existing = fs.readFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', 'utf8');

    // Find the existing entry and update it with a follow-up note, or add a new entry
    // For simplicity, we'll add a follow-up entry
    const followUpInfo = `
---

### 📝 Follow-up enviado para: ${leadName} (São Paulo - SP)
- **Telefone / WhatsApp:** \`+${leadPhone}\` (JID: \`${targetJid}\`)
- **Status:** 📤 **Mensagem 2 Enviada (Follow-up Personalizado)**
- **Data de Envio:** ${now}
- **Mensagem Enviada:**
  > *"${text.replace(/\n/g, '\\n    > ')}"*`;

    // Insert before the Supabase summary section
    existing = existing.replace('## 📊 Resumo do Status no Supabase', followUpInfo + '\n## 📊 Resumo do Status no Supabase');
    fs.writeFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', existing);
    console.log('✅ Log do Obsidian atualizado com follow-up!');
  }
}

sendCustomMessage().catch(console.error);