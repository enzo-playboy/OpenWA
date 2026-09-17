const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

async function check() {
  const res = await fetch(`${supabaseUrl}/rest/v1/leads?select=*&order=created_at.desc&limit=100`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  const leads = await res.json();
  console.log('Total leads retrieved from Supabase:', leads.length);
  const statuses = {};
  leads.forEach(l => {
    statuses[l.status] = (statuses[l.status] || 0) + 1;
  });
  console.log('Statuses:', statuses);

  const gold = leads.filter(l => {
    const cat = ((l.category||'') + ' ' + (l.metadata?.category||'')).toLowerCase();
    const name = (l.name||'').toLowerCase();
    return cat.includes('joia') || cat.includes('ouro') || cat.includes('relog') || name.includes('joia') || name.includes('ouro') || name.includes('relog') || name.includes('semijoia');
  });
  console.log('\nGold leads count in Supabase:', gold.length);
  console.log('Gold leads details:');
  gold.forEach(g => {
    console.log(`- ID: ${g.id} | Name: ${g.name} | Phone: ${g.phone} | Status: ${g.status} | Category: ${g.category}`);
  });
}
check();
