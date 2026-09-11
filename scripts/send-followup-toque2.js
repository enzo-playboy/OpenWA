const dotenv = require('dotenv');
dotenv.config();

const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://localhost:2785/api';

async function execute() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing.');
    return;
  }

  // 1. Fetch leads that received Toque 1 (current_step = 1) and haven't replied (status = contacted)
  console.log('🔍 Buscando leads elegíveis para o Toque 2 (Follow-up)...');
  const res = await fetch(supabaseUrl + '/rest/v1/leads?select=*&status=eq.contacted&current_step=eq.1', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey }
  });
  
  const leads = await res.json();
  
  if (!leads || leads.length === 0) {
    console.log('✅ Nenhum lead aguardando Toque 2 no momento.');
    return;
  }

  console.log(`Encontrados ${leads.length} leads para o Toque 2.`);

  // 2. Loop and send Toque 2
  for (const lead of leads) {
    // Basic Spintax resolution
    const saudacao = ['Oi', 'Opa'][Math.floor(Math.random() * 2)];
    const leadName = lead.name || 'pessoal';
    
    const text = `${saudacao}, tudo bem?\n\nConseguiu ver a mensagem anterior? A gente tá montando algumas páginas e catálogos online pra empresas da região essa semana e lembrei de vocês.`;

    const chatId = lead.phone + '@c.us';
    console.log(`🚀 Enviando Toque 2 para ${leadName} (${chatId})...`);

    try {
      const sendRes = await fetch(BASE_URL + '/sessions/' + SESSION_ID + '/messages/send-text', {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chatId, text })
      });

      if (sendRes.ok) {
        // Update to current_step 2
        await fetch(supabaseUrl + '/rest/v1/leads?phone=eq.' + lead.phone, {
          method: 'PATCH',
          headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_step: 2 })
        });
        console.log(`✅ Toque 2 enviado com sucesso para ${leadName}!`);
      } else {
        console.error(`❌ Falha ao enviar para ${leadName}: ${sendRes.status}`);
      }
    } catch (e) {
      console.error(`❌ Erro de conexão ao enviar para ${leadName}:`, e.message);
    }
    
    // Anti-ban delay (5 to 10 seconds between sends)
    await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
  }
}

execute();
