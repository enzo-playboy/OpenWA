const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;
delete process.env.ALL_PROXY;
delete process.env.all_proxy;

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

const CHIP_1_SESSION = '84e58e30-9c99-4eb5-8e27-c6604778d1cd'; // Chip 1 Principal (B2B / Agro / Drones / Marcenaria)
const CHIP_2_SESSION = '764ba619-c986-4b7b-bea8-fa67c2845b01'; // Chip 2 TOR Proxy (EXCLUSIVO OURO / JOALHERIA)

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_ID,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error('⚠️ Erro ao notificar Telegram:', err.message);
  }
}

// Limpa nomes longos e poluídos
function cleanLeadName(rawName) {
  if (!rawName) return 'empresa';
  let name = rawName.split('-')[0].split('|')[0].split(',')[0].trim();
  name = name.replace(/CRECI.*/i, '').replace(/Studio.*/i, '').trim();
  if (name.length > 30) {
    name = name.substring(0, 30).trim();
  }
  return name;
}

// Gera mensagens SDR hiper-personalizadas por nicho, com spintax e alta variação (antispam)
function generateDynamicSdrMessage(lead, index) {
  const cleanName = cleanLeadName(lead.name);
  const cat = ((lead.category || '') + ' ' + (lead.metadata?.category || '')).toLowerCase();

  const greetings = ['Olá, boa tarde!', 'Oi, tudo bem?', 'Boa tarde!', 'Olá! Tudo joia?', 'Oi! Boa tarde.'];
  const greeting = greetings[(index + Math.floor(Math.random() * 5)) % greetings.length];

  let nicheMention = 'produtos e serviços';
  if (cat.includes('drone') || cleanName.toLowerCase().includes('drone') || cat.includes('pulveriz')) {
    nicheMention = 'serviços de pulverização e tecnologia com drones';
  } else if (cat.includes('racao') || cat.includes('nutric') || cat.includes('pet') || cleanName.toLowerCase().includes('racao')) {
    nicheMention = 'linha de rações e nutrição animal';
  } else if (cat.includes('joia') || cat.includes('ouro') || cat.includes('relog') || cleanName.toLowerCase().includes('joia')) {
    nicheMention = 'linha de joias e peças em ouro';
  } else if (cat.includes('marcenaria') || cat.includes('moveis')) {
    nicheMention = 'projetos de marcenaria e móveis sob medida';
  } else if (cat.includes('clima') || cat.includes('vrf')) {
    nicheMention = 'serviços de climatização e projetos térmicos';
  }

  const variations = [
    `${greeting} Gostaria de falar com o responsável comercial da ${cleanName}.`,
    `${greeting} Quem é a pessoa que cuida das vendas e atendimento na ${cleanName}?`,
    `${greeting} Trabalhamos com desenvolvimento de catálogos digitais para ${nicheMention}. Falo com o responsável da ${cleanName}?`,
    `${greeting} Vocês da ${cleanName} já possuem catálogo digital interativo para apresentação dos ${nicheMention}?`,
    `${greeting} Queria ver com quem posso falar sobre a apresentação digital da ${cleanName}.`,
    `${greeting} Passando pra saber quem atende a parte de vendas e catálogos da ${cleanName}.`,
    `${greeting} Vocês da ${cleanName} recebem pedidos e orçamentos direto por esse número?`
  ];

  const saltIndex = (index * 3 + Math.floor(Math.random() * 7)) % variations.length;
  return variations[saltIndex];
}

function isLunchTime() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return ((hours === 11 && minutes >= 30) || (hours === 12));
}

// Worker independente por Chip
async function runChipWorker(chipName, chipSession, leadsList) {
  if (leadsList.length === 0) {
    console.log(`⚠️ [Worker ${chipName}] Nenhum lead atribuído.`);
    return;
  }

  console.log(`🚀 [Worker ${chipName}] Iniciando fila de ${leadsList.length} Leads de Ouro...`);

  for (let index = 0; index < leadsList.length; index++) {
    // Checagem de horário de almoço (11:30 às 13:00)
    if (isLunchTime()) {
      console.log(`\n🍲 [${chipName}] Horário de almoço atingido (11:30 - 13:00). Pausando disparos...`);
      await sendTelegram(`🍲 *[${chipName}] Pausa de Almoço (11:30 - 13:00)*\n\nDisparos da Campanha Ouro pausados durante o almoço.`);
      
      while (isLunchTime()) {
        await sleep(60000);
      }
      
      console.log(`\n⏰ [${chipName}] 13:00 atingido! Retomando prospecção da tarde...\n`);
      await sendTelegram(`⏰ *[${chipName}] Retomando Prospecção Ouro (13:00)*\n\nEnvios reiniciados normalmente.`);
    }

    const { lead, phone, jid } = leadsList[index];
    
    // Filtro de segurança para contatos sob guarda manual do usuário
    const PROTECTED_NUMBERS = ['5511981381228', '5511930539183', '11981381228', '11930539183'];
    const cleanPhoneDigits = phone.replace(/\D/g, '');
    if (PROTECTED_NUMBERS.some(num => cleanPhoneDigits.endsWith(num))) {
      console.log(`🔒 [${chipName}] IGNORADO (Atendimento Manual Ativo): ${lead.name} (${phone})`);
      continue;
    }

    const text = generateDynamicSdrMessage(lead, index);

    console.log(`--------------------------------------------------`);
    console.log(`📤 [${chipName}] Disparando Lead Ouro [${index + 1}/${leadsList.length}] - ${lead.name}`);
    console.log(`📱 WhatsApp: +${phone} (\`${jid}\`)`);
    console.log(`💬 Mensagem SDR: "${text}"`);

    try {
      const sendRes = await fetch(`${BASE_URL}/sessions/${chipSession}/messages/send-text`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatId: jid,
          text: text
        })
      });

      if (sendRes.ok) {
        console.log(`✅ [${chipName}] Disparo efetuado com SUCESSO para ${lead.name}!`);

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;
        await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${lead.id}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'contacted', current_step: 1 })
        });

        const now = new Date().toLocaleString('pt-BR');
        const logEntry = `
---
### 💎 ${lead.name} (Lead de Ouro - CAMPANHA_100_LEADS_OURO)
- **Telefone / WhatsApp:** \`+${phone}\` (JID: \`${jid}\`)
- **Canal de Envio:** ${chipName}
- **Status:** 📤 Mensagem SDR Dinâmica Enviada
- **Data/Hora:** ${now}
- **Mensagem:**
  > *"${text}"*
`;
        fs.appendFileSync('e:/prosp/OpenWA/LEADS_PROSPECTADOS_OBSIDIAN.md', logEntry);

        await sendTelegram(`✅ *[${chipName}] Lead Ouro Enviado! (CAMPANHA_100_LEADS_OURO)*\n\n💎 *Empresa:* ${cleanLeadName(lead.name)}\n📞 *WhatsApp:* \`+${phone}\` \n💬 *Texto:* _"${text}"_`);
      } else {
        const errText = await sendRes.text();
        console.error(`❌ [${chipName}] Falha no envio para ${lead.name} (${sendRes.status}):`, errText);
        await sendTelegram(`❌ *[${chipName}] Erro no Envio*\n\nLead: ${lead.name}\nStatus: ${sendRes.status}`);
      }
    } catch (err) {
      console.error(`❌ [${chipName}] Exceção ao enviar para ${lead.name}:`, err.message);
      await sendTelegram(`🚨 *[${chipName}] Exceção no Envio*\n\nLead: ${lead.name}\nErro: \`${err.message}\``);
    }

    // Intervalo com +2 minutos adicionados à cadência (8 a 10 minutos / 480 a 600 segundos) por chip
    if (index < leadsList.length - 1) {
      const delaySeconds = 480 + Math.floor(Math.random() * 120);
      const delayMinutes = (delaySeconds / 60).toFixed(1);

      console.log(`\n⏳ [${chipName}] Aguardando ${delayMinutes} min (${delaySeconds}s) antes do próximo disparo...`);
      await sendTelegram(`⏳ *[${chipName}] Aguardando ${delayMinutes} min* para a próxima empresa...`);
      await sleep(delaySeconds * 1000);
    }
  }

  console.log(`🎉 [${chipName}] Fila da Campanha Ouro concluída!`);
}

async function runDisparoParaleloPorChip() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  console.log('📖 Buscando Leads de Ouro & Agro oficiais no banco Supabase...\n');

  const res = await fetch(`${supabaseUrl}/rest/v1/leads?select=*&status=in.(pending,LEAD_QUALIFIED)&order=created_at.desc&limit=100`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  const leads = await res.json();

  const chip1Leads = [];
  const chip2Leads = [];

  for (let i = 0; i < leads.length; i++) {
    if (chip1Leads.length + chip2Leads.length >= 60) break;

    const lead = leads[i];
    const rawPhone = (lead.phone || '').replace(/\D/g, '');
    if (!rawPhone || rawPhone.length < 10) continue;

    await sleep(150);

    try {
      const checkRes = await fetch(`${BASE_URL}/sessions/${CHIP_1_SESSION}/contacts/check/${rawPhone}`, {
        headers: { 'x-api-key': API_KEY }
      });
      if (checkRes.ok) {
        const result = await checkRes.json();
        if (result.exists && result.whatsappId) {
          const item = { lead, phone: rawPhone, jid: result.whatsappId };
          
          // Filtro rigoroso de nicho com remoção de acentos
          const cleanCat = ((lead.category || '') + ' ' + (lead.metadata?.category || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const cleanNameStr = (lead.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const assignedChip = (lead.metadata?.assigned_chip || '').toLowerCase();

          const isGold = assignedChip.includes('chip 2') || assignedChip.includes('tor')
            || cleanCat.includes('joia') || cleanCat.includes('joalheria') || cleanCat.includes('ouro') || cleanCat.includes('relog') || cleanCat.includes('semijoia') || cleanCat.includes('pedra') || cleanCat.includes('diamond') || cleanCat.includes('aurum') || cleanCat.includes('lapidacao') || cleanCat.includes('💎')
            || cleanNameStr.includes('joia') || cleanNameStr.includes('joalheria') || cleanNameStr.includes('ouro') || cleanNameStr.includes('relog') || cleanNameStr.includes('semijoia') || cleanNameStr.includes('pedra') || cleanNameStr.includes('diamond') || cleanNameStr.includes('aurum') || cleanNameStr.includes('lapidacao');

          const isAgro = cleanCat.includes('agro') || cleanCat.includes('irrig') || cleanCat.includes('sement') || cleanCat.includes('maquin') || cleanCat.includes('trator') || cleanCat.includes('pecuar') || cleanCat.includes('nutric') || cleanCat.includes('foliar') || cleanCat.includes('drone');

          if (isGold) {
            chip2Leads.push(item);
            console.log(`✅ [OURO EXCLUSIVO] -> Chip 2 (TOR): ${cleanLeadName(lead.name)} (+${rawPhone})`);
          } else if (isAgro) {
            // Insere leads Agro no topo do Chip 1
            chip1Leads.unshift(item);
            console.log(`🌾 [AGRO PRIORITÁRIO] -> Chip 1 (Suporte): ${cleanLeadName(lead.name)} (+${rawPhone})`);
          } else {
            chip1Leads.push(item);
            console.log(`✅ [B2B GERAL] -> Chip 1 (Suporte): ${cleanLeadName(lead.name)} (+${rawPhone})`);
          }
        }
      }
    } catch (e) {
      console.error('Erro na checagem:', e.message);
    }
  }


  console.log(`\n🎯 Fila Chip 1 (Suporte Agro): ${chip1Leads.length} Leads | Fila Chip 2 (Ouro Proxy): ${chip2Leads.length} Leads\n`);

  if (chip1Leads.length === 0 && chip2Leads.length === 0) {
    console.log('⚠️ Nenhum lead de ouro pendente com WhatsApp ativo foi encontrado.');
    return;
  }

  await sendTelegram(`🏆 *Campanha Ouro & Agro Iniciada*\n\n- 🧅 Chip 2 (Ouro Proxy TOR): ${chip2Leads.length} Empresas de Ouro\n- 📱 Chip 1 (Suporte Agro/B2B): ${chip1Leads.length} Empresas Agro/B2B\n- ⏱️ Spacing: 6 a 8 min por chip\n- 🚀 Operação em Execução até 18:00.`);


  // Executa Chip 1 e Chip 2 simultaneamente em paralelo!
  await Promise.all([
    runChipWorker('📱 Chip 1 (Principal B2B)', CHIP_1_SESSION, chip1Leads),
    runChipWorker('🧅 Chip 2 (Auto TOR Proxy Ouro)', CHIP_2_SESSION, chip2Leads)
  ]);

  console.log('\n🎉 === CAMPANHA 100 LEADS OURO FINALIZADA COM SUCESSO! ===');
  await sendTelegram(`🎉 *Campanha 100 Leads Ouro Finalizada com Sucesso!* Todas as empresas de ouro programadas foram abordadas.`);
}

runDisparoParaleloPorChip();
