const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function countTodayLeads() {
  const todayPrefix = new Date().toISOString().split('T')[0]; // 2026-09-16

  console.log(`📊 Consultado banco Supabase para leads criados em ${todayPrefix}...\n`);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=*&order=created_at.desc&limit=500`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });

  const leads = await res.json();

  const todayLeads = leads.filter(l => (l.created_at || '').startsWith(todayPrefix));
  
  console.log(`📌 Total de Leads que entraram no Topo de Funil Hoje (${todayPrefix}): ${todayLeads.length}`);

  const bySource = {};
  const byStatus = {};
  const byChip = {};

  todayLeads.forEach(l => {
    const src = l.metadata?.source || 'Importação / Campanha Ouro';
    bySource[src] = (bySource[src] || 0) + 1;

    const st = l.status || 'pending';
    byStatus[st] = (byStatus[st] || 0) + 1;

    const chip = l.metadata?.assigned_chip || 'Chip 1 (Principal)';
    byChip[chip] = (byChip[chip] || 0) + 1;
  });

  console.log('\n📁 Distribuição por Fonte de Origem:');
  for (const [src, count] of Object.entries(bySource)) {
    console.log(`  - ${src}: ${count} leads`);
  }

  console.log('\n📲 Distribuição por Chip Atribuído:');
  for (const [chip, count] of Object.entries(byChip)) {
    console.log(`  - ${chip}: ${count} leads`);
  }

  console.log('\n🔄 Distribuição por Status no Funil:');
  for (const [st, count] of Object.entries(byStatus)) {
    console.log(`  - ${st}: ${count} leads`);
  }
}

countTodayLeads();
