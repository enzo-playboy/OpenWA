const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = 'dev-admin-key';
const SESSION_ID = '84e58e30-9c99-4eb5-8e27-c6604778d1cd';
const BASE_URL = 'http://127.0.0.1:2785/api';

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN não configurado no arquivo .env!');
  console.log('👉 Crie seu bot no Telegram falando com o @BotFather, pegue o Token e insira no .env como TELEGRAM_BOT_TOKEN=seu_token');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastUpdateId = 0;
let adminChatId = process.env.TELEGRAM_ADMIN_ID ? Number(process.env.TELEGRAM_ADMIN_ID) : null;

async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  try {
    const body = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('⚠️ Erro ao enviar mensagem Telegram:', err.message);
  }
}

async function getOpenWaStatus() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  try {
    const resPending = await fetch(`${supabaseUrl}/rest/v1/leads?select=id&status=eq.pending`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    const pendingLeads = await resPending.json();

    const resContacted = await fetch(`${supabaseUrl}/rest/v1/leads?select=id&status=eq.contacted`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    const contactedLeads = await resContacted.json();

    const aiRes = await fetch(`${BASE_URL}/ai-agent/config`, {
      headers: { 'x-api-key': API_KEY },
    });
    const aiConfig = await aiRes.json();

    return `
📊 *Status do Sistema OpenWA*
----------------------------------
🟢 *Sofia AI (Auto-reply):* ${aiConfig.autoReplyOnLeadMessage ? 'ATIVA' : 'PAUSADA'}
⏳ *Leads Pendentes:* ${pendingLeads.length || 0}
📤 *Leads Prospectados:* ${contactedLeads.length || 0}
⏱️ *Buffer da Sofia:* ${aiConfig.bufferDelayMs / 1000}s
`;
  } catch (err) {
    return `⚠️ Erro ao obter status do sistema: ${err.message}`;
  }
}

async function triggerNextLead() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/leads?select=*&status=eq.pending&order=created_at.desc`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    const leads = await res.json();

    let targetLead = null;
    let targetJid = null;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const checkRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/contacts/check/${lead.phone}`, {
        headers: { 'x-api-key': API_KEY },
      });
      if (!checkRes.ok) continue;
      const result = await checkRes.json();
      if (result.exists && result.whatsappId) {
        targetLead = lead;
        targetJid = result.whatsappId;
        break;
      }
    }

    if (!targetLead || !targetJid) {
      return '❌ Nenhum lead pendente com WhatsApp ativo foi encontrado.';
    }

    const leadName = targetLead.name;
    const text = `Oi! Tudo bem?\n\nPesquisei por joalherias no Google e encontrei o perfil da ${leadName}.\n\nVocês já têm um site ou catálogo online com os modelos atualizados pra mandar pros clientes, ou fazem o atendimento só direto no WhatsApp?`;

    const sendRes = await fetch(`${BASE_URL}/sessions/${SESSION_ID}/messages/send-text`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chatId: targetJid, text: text }),
    });

    if (sendRes.ok) {
      await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${targetLead.id}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'contacted', current_step: 1 }),
      });

      return `✅ *Disparo Efetuado com Sucesso!*\n\n💎 *Lead:* ${leadName}\n📱 *WhatsApp:* \`${targetJid}\`\n📤 *Mensagem:* Enviada (Foco em Site/Catálogo)`;
    } else {
      return `❌ Falha ao enviar para ${leadName}. Código API: ${sendRes.status}`;
    }
  } catch (err) {
    return `❌ Erro no envio: ${err.message}`;
  }
}

async function handleTelegramCommand(chatId, text) {
  const cmd = text.trim().toLowerCase();

  // Trava de Segurança: registra o ID do dono na primeira mensagem se não houver um pré-configurado
  if (!adminChatId) {
    adminChatId = chatId;
    console.log(`🔐 Admin do Telegram definido com sucesso para o ID: ${adminChatId}`);
  } else if (adminChatId !== chatId) {
    await sendTelegramMessage(chatId, '⛔ Acesso negado. Este bot é de uso exclusivo do administrador.');
    return;
  }

  if (cmd === '/start' || cmd === '/ajuda' || cmd === 'menu') {
    const keyboard = {
      keyboard: [
        [{ text: '📊 Status' }, { text: '🚀 Disparar 1 Lead' }],
        [{ text: '⏸️ Pausar Sofia' }, { text: '▶️ Ativar Sofia' }],
        [{ text: '📋 Relatório Hoje' }],
      ],
      resize_keyboard: true,
    };
    await sendTelegramMessage(
      chatId,
      `👋 *Olá! Sou o seu Assistente Pessoal do OpenWA no Telegram.*

Estou conectado ao seu computador. O que você gostaria de fazer agora?

Use os botões abaixo ou envie qualquer pergunta!`,
      keyboard,
    );
  } else if (cmd === '📊 status' || cmd === '/status') {
    const statusMsg = await getOpenWaStatus();
    await sendTelegramMessage(chatId, statusMsg);
  } else if (cmd === '🚀 disparar 1 lead' || cmd === '/disparar') {
    await sendTelegramMessage(chatId, '⏳ Buscando lead e disparando via WhatsApp...');
    const resultMsg = await triggerNextLead();
    await sendTelegramMessage(chatId, resultMsg);
  } else if (cmd === '⏸️ pausar sofia' || cmd === '/pausar') {
    await fetch(`${BASE_URL}/ai-agent/config`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoReplyOnLeadMessage: false }),
    });
    await sendTelegramMessage(chatId, '⏸️ *Sofia AI Pausada Globalmente!* Ela não responderá leads até ser ativada.');
  } else if (cmd === '▶️ ativar sofia' || cmd === '/ativar') {
    await fetch(`${BASE_URL}/ai-agent/config`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoReplyOnLeadMessage: true }),
    });
    await sendTelegramMessage(chatId, '▶️ *Sofia AI Ativada Globalmente!* Respostas automáticas em funcionamento.');
  } else if (cmd === '📋 relatório hoje' || cmd === '/relatorio') {
    try {
      const relatorio = fs.readFileSync('e:/prosp/OpenWA/RELATORIO_EXECUCAO_DIA.md', 'utf8');
      const resumo = relatorio.substring(0, 1000);
      await sendTelegramMessage(chatId, `📑 *Relatório de Operação:*\n\n${resumo}...`);
    } catch {
      await sendTelegramMessage(chatId, '⚠️ Nenhum relatório gerado para hoje ainda.');
    }
  } else {
    // Resposta Inteligente via AI para dúvidas gerais do usuário
    try {
      const aiRes = await fetch(`${BASE_URL}/ai-agent/generate`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: [],
        }),
      });
      const data = await aiRes.json();
      const reply = data.reply || 'Recebi seu comando, mas não consegui processar a resposta.';
      await sendTelegramMessage(chatId, reply);
    } catch (err) {
      await sendTelegramMessage(chatId, `🤖 Entendi seu comando: "${text}". O sistema está ativo e aguardando suas instruções!`);
    }
  }
}

async function pollTelegram() {
  console.log('🤖 Bot do Telegram OpenWA iniciado com sucesso!');
  console.log('📱 Aguardando suas mensagens no Telegram...');

  while (true) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
      if (!res.ok) {
        await sleep(5000);
        continue;
      }
      const data = await res.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;
          if (update.message && update.message.text) {
            await handleTelegramCommand(update.message.chat.id, update.message.text);
          }
        }
      }
    } catch (err) {
      // Erro de rede temporário ou timeout de long-poll
      await sleep(3000);
    }
  }
}

pollTelegram();
