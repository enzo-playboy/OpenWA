const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const LEADS_TABLE = process.env.SUPABASE_LEADS_TABLE || 'leads';

async function listLeads() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('SUPABASE_URL e SUPABASE_KEY precisam estar configurados no .env!');
    process.exit(1);
  }

  console.log('🔍 Buscando leads do Supabase...');
  
  // Fetch leads with basic information
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${LEADS_TABLE}?select=id,name,phone,metadata,status,current_step&limit=30&order=created_at.desc`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Erro ao buscar leads:', errorText);
    process.exit(1);
  }

  const leads = await res.json();
  
  console.log(`\n📊 Lista de ${leads.length} leads para prospecção:\n`);
  
  leads.forEach((lead, index) => {
    const phone = lead.phone;
    const name = lead.name || 'Nome não informado';
    const status = lead.status || 'status desconhecido';
    const step = lead.current_step || 0;
    
    // Extract company from metadata if available
    const company = lead.metadata?.company || lead.metadata?.raw_data?.companyName || 'Empresa não informada';
    const cidade = lead.metadata?.raw_data?.personCity || lead.metadata?.raw_data?.city || 'Cidade não informada';
    const estado = lead.metadata?.raw_data?.personState || lead.metadata?.raw_data?.state || 'Estado não informado';
    
    console.log(`${index + 1}. ${name}`);
    console.log(`   📱 Telefone: ${phone}`);
    console.log(`   🏢 Empresa: ${company}`);
    console.log(`   📍 Localização: ${cidade}, ${estado}`);
    console.log(`   📈 Status: ${status} (Etapa: ${step})`);
    console.log('');
  });
}

listLeads().catch(console.error);