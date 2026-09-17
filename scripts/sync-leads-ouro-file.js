const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

async function syncGoldLeadsFromFile() {
  console.log('📖 Lendo lista oficial de 100 Leads de Ouro do arquivo CAMPANHA_100_LEADS_OURO.md...\n');

  const content = fs.readFileSync('e:/prosp/OpenWA/CAMPANHA_100_LEADS_OURO.md', 'utf8');
  const lines = content.split('\n');

  const parsedLeads = [];

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 8) continue;

    const num = parseInt(parts[1], 10);
    if (isNaN(num)) continue; // Pula cabeçalho

    const name = parts[2];
    const phone = parts[3].replace(/\D/g, '');
    const role = parts[4];
    const category = parts[5];
    const chip = parts[6];

    parsedLeads.push({
      num,
      name,
      phone,
      role,
      category,
      chip,
      status: 'pending'
    });
  }

  console.log(`✅ ${parsedLeads.length} Leads de Ouro extraídos com sucesso de CAMPANHA_100_LEADS_OURO.md!\n`);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Supabase URL/Key não configurado.');
    return;
  }

  // Sincronizar / Inserir no Supabase com tag 'LEAD_OURO'
  let inserted = 0;
  for (const lead of parsedLeads) {
    try {
      const payload = {
        name: lead.name,
        phone: lead.phone,
        status: 'pending',
        metadata: {
          tag: 'LEAD_OURO',
          category: lead.category,
          assigned_chip: lead.chip,
          role: lead.role,
          list_index: lead.num
        }
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        inserted++;
      }
    } catch (e) {
      // Ignora duplicados ou erros pontuais
    }
  }

  console.log(`🎉 ${inserted} Leads de Ouro sincronizados e salvos no banco de dados!`);
}

syncGoldLeadsFromFile();
