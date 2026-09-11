const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

async function syncObsidian() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing.');
    return;
  }

  const res = await fetch(supabaseUrl + '/rest/v1/leads?select=*', {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  
  const leads = await res.json();
  const dir = './clientes';
  
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }

  // Dashboard central
  let dashboard = '# 📊 Dashboard de Performance\n\n';
  let pending = 0, contacted = 0, replied = 0, lost = 0;

  leads.forEach(lead => {
    const nomeArquivo = `${dir}/${lead.name.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
    
    // Status formatado para Tags do Obsidian
    let tagStatus = '#status/pendente';
    if(lead.status === 'pending') { tagStatus = '#status/fila'; pending++; }
    if(lead.status === 'contacted') { tagStatus = '#status/contatado_toque' + lead.current_step; contacted++; }
    if(lead.status === 'replied') { tagStatus = '#status/em_atendimento_ia'; replied++; }
    if(lead.status === 'lost') { tagStatus = '#status/perdido'; lost++; }

    const content = `---
telefone: "${lead.phone}"
empresa: "${lead.name}"
status_funil: "${lead.status}"
step: ${lead.current_step}
site: ${lead.metadata?.has_website ? 'sim' : 'nao'}
---

# ${lead.name}

**Informações do Lead:**
- 📞 Telefone: +${lead.phone}
- 🏷️ Nicho: Relojoaria
- 📌 Endereço: ${lead.metadata?.raw_data?.address || 'N/A'}

## Status no Funil de Vendas
${tagStatus}

**Etapa Atual:** ${lead.current_step} (Toque ${lead.current_step})
**Última Interação da IA:** ${lead.last_reply_at ? new Date(lead.last_reply_at).toLocaleString('pt-BR') : 'Nenhuma ainda'}

## Resumo das Respostas
> ${lead.last_reply_text ? lead.last_reply_text : 'Ainda não respondeu as mensagens automáticas.'}

---
[[Dashboard_Performance]]
`;
    fs.writeFileSync(nomeArquivo, content);
  });

  // Atualizar Dashboard Central
  dashboard += `- **Total de Leads na Base:** ${leads.length}\n`;
  dashboard += `- 🧊 **Na Fila (Frios):** ${pending}\n`;
  dashboard += `- 📤 **Mensagens Enviadas (Aguardando):** ${contacted}\n`;
  dashboard += `- 💬 **Respondidos (Conversando com a IA):** ${replied}\n`;
  dashboard += `- ❌ **Perdidos / Não responderam aos 3 toques:** ${lost}\n\n`;
  
  dashboard += `## Gráfico de Conexões\nAs tags criarão um mapa visual automático no seu Obsidian ligando cada cliente ao seu status de funil!\n\n`;
  dashboard += `*Dica: Arraste a pasta "clientes" para dentro do seu cofre "bott" para visualizar os gráficos.*`;
  
  fs.writeFileSync(`${dir}/Dashboard_Performance.md`, dashboard);
  
  console.log('✅ Sincronização com Obsidian concluída! ' + leads.length + ' arquivos criados na pasta /clientes.');
}

syncObsidian();
