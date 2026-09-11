const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

async function getLeads() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  const res = await fetch(supabaseUrl + '/rest/v1/leads?select=*&status=eq.pending&order=created_at.desc&limit=10', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
  });
  
  if (!res.ok) {
    console.error('Error fetching leads:', await res.text());
    return;
  }
  
  const leads = await res.json();
  
  console.log(JSON.stringify(leads, null, 2));
}

getLeads();
