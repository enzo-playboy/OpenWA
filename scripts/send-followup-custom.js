const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
// O SESSION_ID precisa ser atualizado se você criou uma nova sessão.
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd'; 
const BASE_URL = 'http://127.0.0.1:2785/api';

const customLeads = [
  { phone: '556791311680', name: 'Lead' }
];

async function execute() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  console.log('🔍 Iniciando disparos de Follow-up (Toque 2) para lista customizada...');

  for (const lead of customLeads) {
    const saudacao = ['Oi', 'Opa'][Math.floor(Math.random() * 2)];
    const leadName = lead.name !== 'Lead' ? lead.name : 'pessoal';
    
    // Texto do Toque 2 padrão do seu funil
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
        console.log(`✅ Toque 2 enviado com sucesso para ${leadName}!`);
        // Atualiza no banco se houver credenciais
        if (supabaseUrl && supabaseKey) {
          await fetch(supabaseUrl + '/rest/v1/leads?phone=eq.' + lead.phone, {
            method: 'PATCH',
            headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_step: 2 })
          });
        }
      } else {
        console.error(`❌ Falha ao enviar para ${leadName}: ${sendRes.status}`);
      }
    } catch (e) {
      console.error(`❌ Erro de conexão ao enviar para ${leadName}:`, e.message);
    }
    
    // Anti-ban delay (5 to 10 seconds entre envios)
    const delay = 5000 + Math.random() * 5000;
    console.log(`Aguardando ${(delay/1000).toFixed(1)} segundos (Anti-ban)...`);
    await new Promise(r => setTimeout(r, delay));
  }
  
  console.log('🎉 Finalizado envio de follow-ups customizados!');
}

execute();
