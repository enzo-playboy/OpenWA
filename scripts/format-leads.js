const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

async function formatLeads() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  const res = await fetch(supabaseUrl + '/rest/v1/leads?select=*&status=eq.pending&order=created_at.desc&limit=10', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
  });
  
  const leads = await res.json();
  let markdown = '### 📋 Lista de Leads para Hoje (Próximos 10 Pendentes)\n\n';
  markdown += '| # | Empresa | Cidade | WhatsApp |\n';
  markdown += '|---|---|---|---|\n';
  
  leads.forEach((l, i) => {
    const city = l.metadata?.raw_data?.city || 'N/A';
    const state = l.metadata?.raw_data?.state || '';
    markdown += `| ${i+1} | **${l.name}** | ${city} - ${state} | +${l.phone} |\n`;
  });
  
  markdown += '\n### 💬 Mensagem Padrão que será enviada:\n\n';
  markdown += '> "Oi! Tudo bem?\\n\\nPesquisei por joalherias no Google e encontrei o perfil da **[Nome da Empresa]**.\\n\\nVocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?"\n';
  
  fs.writeFileSync('e:/prosp/OpenWA/scratch/next-leads.md', markdown);
}

formatLeads();
