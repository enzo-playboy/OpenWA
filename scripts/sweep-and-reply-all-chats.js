/**
 * OpenWA - Full Automated Sweep & AI Lead Nurturing Engine
 * 
 * Implements:
 * 1. Automatic 30s Loop Sweep across BOTH sessions (chip-2-iphone and suportew)
 * 2. Un-replied Lead Detection (direction === 'incoming')
 * 3. Native Audio Transcription & Interpretation via Gemini 2.5 Flash
 * 4. "Técnica do Pequeno Sim" & Open Question Sales Nurturing
 * 5. Instant Telegram Alerts & Supabase Synchronization
 */

const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });
const { normalizePhoneBR, cleanLeadName } = require('./lib-phone-normalizer');
const { isProtectedPhone, updateLeadInSupabase } = require('./lib-leads-db');

const API_KEY = process.env.API_MASTER_KEY || 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

const SESSIONS = [
  { id: '764ba619-c986-4b7b-bea8-fa67c2845b01', name: 'chip-2-iphone (Proxy TOR)', niche: 'Arquitetura, Marcenarias & Móveis' }
];

const repliedLock = new Map();

async function sendTelegramAlert(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_ADMIN_ID, text, parse_mode: 'Markdown' })
    });
  } catch (err) {}
}

async function fetchChatMessages(sessionId, jid) {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages?chatId=${jid}&limit=12`, {
      headers: { 'x-api-key': API_KEY }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    return [];
  }
}

async function fetchRecentMessagesAll(sessionId) {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages?limit=60`, {
      headers: { 'x-api-key': API_KEY }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    return [];
  }
}

async function transcribeAudioGemini(base64Data, mimeType = 'audio/ogg') {
  if (!GEMINI_API_KEY || !base64Data) return null;
  const cleanMime = mimeType.split(';')[0];
  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: cleanMime, data: base64Data } },
              { text: 'Transcreva exatamente e de forma completa o áudio enviado em português do Brasil:' }
            ]
          }
        ]
      })
    });
    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch (err) {
    return null;
  }
}

async function generateAIConversationHook(niche, pushName, historyMessages, lastIncomingMessage, isAudio = false) {
  if (!GEMINI_API_KEY) return null;

  const formattedHistory = historyMessages.map(m => {
    const sender = m.direction === 'incoming' ? (pushName || 'Lead') : 'Você';
    return `${sender}: ${m.body || m.text || '[Mídia]'}`;
  }).join('\n');

  const systemPrompt = `
Você é um consultor comercial especialista no segmento de ${niche}.
Você está conversando no WhatsApp com o responsável ou representante da empresa (${pushName}).

OBJETIVO DA MENSAGEM:
1. Usar a Técnica do "Pequeno Sim" ou Pergunta Aberta Simples para manter o lead engajado.
2. NUNCA fazer texto longo. Máximo 2 frases curtas (ideal 1 a 2 frases).
3. CASO O LEAD PERGUNTE "Você é arquiteto?" OU "Quem é você?": Responda com simpatia que você desenvolve portais web/catálogos 3D pra empresas do setor, e pergunte se eles já usam site próprio hoje.
4. CASO O LEAD ACEITE OU PEÇA PRA VER O LINK/DEMO (ex: "Pode sim", "Manda", "Pode mandar"): Envie o link oficial de demonstração do portal: https://inspiring-portfolio-studio.vercel.app/ e pergunte a opinião dele sobre o visual.
5. CASO O LEAD DIGA QUE NÃO PRECISA / NÃO TEM INTERESSE: Responda de forma extremamente educada e descontraída (ex: "Sem problemas! Agradeço a atenção e um ótimo trabalho por aí! 🙏").
5. CASO O LEAD SEJA UM MENU/BOT AUTOMÁTICO: Diga que gostaria de ver com o responsável comercial se eles já têm um mostruário/site próprio pros projetos.
`;

  const userPrompt = `
Histórico recente da conversa:
${formattedHistory}

Última mensagem recebida do lead (${pushName}) ${isAudio ? '[MENSAGEM DE ÁUDIO TRANCRITA]' : ''}:
"${lastIncomingMessage}"

Gere a resposta ideal em português do Brasil para o WhatsApp:
`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ]
      })
    });

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch (err) {
    return null;
  }
}

async function sendWhatsAppMessage(sessionId, phone, text) {
  try {
    const jid = `${phone}@c.us`;
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages/send-text`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: jid, text })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function runSweepSession(sessionConfig) {
  const { id: sessionId, name: sessionName, niche } = sessionConfig;
  console.log(`\n🔍 [VARREDURA INICIADA] Verificando conversas pendentes em ${sessionName}...`);

  const messages = await fetchRecentMessagesAll(sessionId);
  if (!messages || messages.length === 0) return;

  // Agrupa mensagens por chatId mantendo a mensagem mais recente
  const lastMsgByChat = {};
  for (const m of messages) {
    if (!lastMsgByChat[m.chatId]) {
      lastMsgByChat[m.chatId] = m;
    }
  }

  for (const chatId of Object.keys(lastMsgByChat)) {
    const lastMsg = lastMsgByChat[chatId];
    if (lastMsg.direction !== 'incoming') continue; // Só responde se a ÚLTIMA mensagem foi do LEAD

    const phoneObj = normalizePhoneBR(chatId);
    if (!phoneObj.is_valid) continue;

    const phone = phoneObj.normalized;
    if (isProtectedPhone(phone)) {
      console.log(`🛡️ Contato protegido +${phone}. Pulando auto-resposta.`);
      continue;
    }

    // Trava anti-duplicação de resposta (1 minuto)
    const lockKey = `${sessionId}:${phone}:${lastMsg.waMessageId || lastMsg.id}`;
    if (repliedLock.has(lockKey)) continue;
    repliedLock.set(lockKey, Date.now());

    const pushName = cleanLeadName(lastMsg.chatName || lastMsg.from || phone);

    let bodyText = (lastMsg.body || lastMsg.text || '').trim();
    let isAudio = false;

    // Transcrição se áudio
    const isAudioType = lastMsg.type === 'audio' || lastMsg.type === 'ptt' || lastMsg.mediaMimetype?.includes('audio');
    const base64Audio = lastMsg.metadata?.media?.data;

    if (isAudioType && base64Audio) {
      isAudio = true;
      console.log(`🎙️ Transcrevendo áudio recebido de ${pushName} (+${phone})...`);
      const transcribed = await transcribeAudioGemini(base64Audio, lastMsg.mediaMimetype || 'audio/ogg');
      if (transcribed) bodyText = transcribed;
    }

    if (!bodyText) continue;

    console.log(`--------------------------------------------------`);
    console.log(`📩 [LEAD PENDENTE DE RESPOSTA em ${sessionName}]`);
    console.log(`👤 Lead: ${pushName} (+${phone}) | JID: ${phoneObj.jid}`);
    console.log(`💬 Mensagem do Lead (${isAudio ? 'Áudio' : 'Texto'}): "${bodyText}"`);

    // Notifica Telegram
    await sendTelegramAlert(
      `📩 *Varredura: Nova Resposta do Lead!*\n\n📱 *Sessão:* ${sessionName}\n👤 *Lead:* ${pushName} (\`+${phone}\`)\n💬 *Mensagem:* _"${bodyText}"_`
    );

    // Busca histórico da conversa
    const history = await fetchChatMessages(sessionId, phoneObj.jid);

    // Gera resposta com Pequeno Sim / Nurturing
    console.log(`🤖 Gerando resposta contextual de alta conversão (Gemini 2.5 Flash)...`);
    const aiResponse = await generateAIConversationHook(niche, pushName, history, bodyText, isAudio);

    if (aiResponse) {
      // Rigor anti-ban + naturalidade (AGENTS.md): 1-2 min antes de responder, o que também
      // garante espaçamento entre respostas consecutivas no mesmo chip.
      console.log(`⏳ Aguardando 1-2 min antes de responder (anti-ban + tempo humano de leitura)...`);
      await new Promise(r => setTimeout(r, 60_000 + Math.random() * 60_000));

      console.log(`📤 Enviando auto-resposta para ${pushName}: "${aiResponse}"`);
      const sent = await sendWhatsAppMessage(sessionId, phone, aiResponse);

      if (sent) {
        console.log(`✅ [${new Date().toLocaleTimeString()}] Resposta enviada com SUCESSO!`);
        void updateLeadInSupabase(phone, {
          status: 'replied_nurturing',
          metadata: { last_ai_reply: aiResponse, replied_at: new Date().toISOString() }
        });
        await sendTelegramAlert(
          `🤖 *Varredura: Resposta Enviada pro Lead!*\n\n👤 *Lead:* ${pushName} (\`+${phone}\`)\n💬 *Resposta:* _"${aiResponse}"_`
        );
      } else {
        console.error(`❌ Falha no envio da auto-resposta para ${pushName}`);
      }
    }
  }
}

async function startContinuousSweep() {
  console.log('⚡ ENGINE DE VARREDURA CONTÍNUA E NUTRIÇÃO DE LEADS INICIADO!');
  console.log('⏱️ Verificando novas mensagens pendentes a cada 30 segundos nas 2 sessões...\n');

  while (true) {
    for (const sessionConfig of SESSIONS) {
      try {
        await runSweepSession(sessionConfig);
      } catch (e) {
        console.error(`⚠️ Erro na varredura da sessão ${sessionConfig.name}:`, e.message);
      }
    }
    await new Promise(r => setTimeout(r, 30000));
  }
}

startContinuousSweep();
