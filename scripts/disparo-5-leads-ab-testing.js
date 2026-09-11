const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// As 3 Variações para Teste A/B/C
const VARIATIONS = [
  {
    id: 'VAR_1',
    name: 'Variação 1 (Confirmação de Responsável)',
    getText: (leadName) => `Oi! Tudo bem?\n\nNesse número eu falo com o responsável da ${leadName}?`
  },
  {
    id: 'VAR_2',
    name: 'Variação 2 (Pesquisa Google / Site & Catálogo)',
    getText: (leadName) => `Oi! Tudo bem?\n\nPesquisei no Google e encontrei o perfil da ${leadName}.\n\nVocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?`
  },
  {
    id: 'VAR_3',
    name: 'Variação 3 (Abordagem Consultiva / Atendimento)',
    getText: (leadName) => `Olá! Tudo bem?\n\nVi o perfil da ${leadName}. Vocês já automatizam a apresentação dos modelos e atendimento no WhatsApp ou o time faz tudo no manual por aí?`
  }
];

async function runDisparo5Leads() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  console.log('🚀 Iniciando Disparo dos 5 Leads com Teste A/B/C (3 Variações)...\n');

  // Busca leads pendentes
  const res = await fetch(`${supabaseUrl}/rest/v1/leads?select=*&status=eq.pending&order=created_at.desc`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  const leads = await res.json();
  console.log(`🔍 Total de leads pendentes no Supabase: ${leads.length}`);

  const targetLeads = [];

  for (let i = 0; i < leads.length; i++) {
    if (targetLeads.length >= 5) break;

    const lead = leads[i];
    await sleep(250);

    try {
      const checkRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/contacts/check/${lead.phone}`, {
        headers: { 'x-api-key': API_KEY }
      });

      if (!checkRes.ok) continue;

      const result = await checkRes.json();
      if (result.exists && result.whatsappId) {
        targetLeads.push({
          lead,
          jid: result.whatsappId
        });
        console.log(`✅ Lead ${targetLeads.length}/5 Válido: ${lead.name} (${lead.phone}) -> JID: ${result.whatsappId}`);
      }
    } catch (e) {
      console.log(`⚠️ Erro ao verificar ${lead.phone}:`, e.message);
    }
  }

  if (targetLeads.length === 0) {
    console.error('❌ Nenhum lead pendente válido com WhatsApp foi encontrado.');
    return;
  }

  console.log(`\n🎯 Encontrados ${targetLeads.length} leads para envio. Iniciando disparos...\n`);

  for (let index = 0; index < targetLeads.length; index++) {
    const { lead, jid } = targetLeads[index];
    const variation = VARIATIONS[index % VARIATIONS.length];
    const messageText = variation.getText(lead.name);

    console.log(`--------------------------------------------------`);
    console.log(`📤 Disparando [Lead ${index + 1}/${targetLeads.length}] - ${lead.name}`);
    console.log(`📱 Telefone: ${lead.phone} | JID: ${jid}`);
    console.log(`🧪 Experimento: ${variation.name}`);
    console.log(`💬 Mensagem:\n"${messageText.replace(/\n/g, ' ')}"\n`);

    try {
      const sendRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages/send-text`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatId: jid,
          text: messageText
        })
      });

      const sendResult = await sendRes.json();

      if (sendRes.ok) {
        console.log(`✅ Envio concluído com sucesso para ${lead.name}!`);

        // Atualiza Supabase
        await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${lead.id}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'contacted', current_step: 1 })
        });

        // Registrar no Obsidian Log
        const now = new Date().toLocaleString('pt-BR');
        const rawData = lead.metadata?.raw_data || {};
        const cidade = rawData.personCity || rawData.city || 'sua cidade';
        const estado = rawData.personState || rawData.state || '';

        const logEntry = `
---

### 💎 ${lead.name} (${cidade} - ${estado})
- **Telefone / WhatsApp:** \`+${lead.phone}\` (JID: \`${jid}\`)
- **Status:** 📤 **Mensagem 1 Enviada (${variation.id}: ${variation.name})**
- **Possui Site:** ❌ Não
- **Data de Envio:** ${now}
- **Mensagem Enviada:**
  > *"${messageText.replace(/\n/g, ' ')}"*
`;

        fs.appendFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', logEntry);
        console.log(`📝 Log atualizado em LEADS_PROSPECTADOS_OBSIDIAN.md`);

      } else {
        console.error(`❌ Erro no envio (${sendRes.status}):`, sendResult);
      }
    } catch (err) {
      console.error(`❌ Exceção ao enviar para ${lead.name}:`, err.message);
    }

    // Delay humano entre os disparos (se não for o último)
    if (index < targetLeads.length - 1) {
      const waitSec = Math.floor(Math.random() * 10) + 15; // 15 a 25 segundos
      console.log(`⏳ Aguardando ${waitSec} segundos (delay anti-ban) antes do próximo disparo...`);
      await sleep(waitSec * 1000);
    }
  }

  console.log('\n✨ Todos os 5 disparos foram concluídos e registrados no Obsidian!');
}

runDisparo5Leads();
