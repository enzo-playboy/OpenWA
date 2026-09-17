/**
 * Library Helper para Banco de Dados de Leads (Supabase / OpenWA REST API)
 * Elimina dependências de leitura/escrita direta em arquivos .md pelos scripts de disparo.
 */

const dotenv = require('dotenv');
const { execSync } = require('child_process');
dotenv.config();

const PROTECTED_PHONES = [
  '5511981381228',
  '+5511981381228',
  '5511930539183',
  '+5511930539183',
];

const CHIP_ROUTING = {
  OURO: {
    sessionId: '764ba619-c986-4b7b-bea8-fa67c2845b01',
    chipName: 'chip-2-iphone (Proxy TOR)',
    useProxy: true,
  },
  AGRO: {
    sessionId: '84e58e30-9c99-4eb5-8e27-c6604778d1cd',
    chipName: 'suportew (Agro)',
    useProxy: false,
  },
};

const lastChipSentAt = {};

function getSupabaseCredentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('❌ Configurações do Supabase ausentes em .env (SUPABASE_URL, SUPABASE_KEY)');
  }
  return { url, key };
}

/**
 * Verifica se um número está protegido de automações.
 */
function isProtectedPhone(phone) {
  if (!phone) return false;
  const clean = String(phone).replace(/\D/g, '');
  return PROTECTED_PHONES.some((prot) => {
    const cleanProt = prot.replace(/\D/g, '');
    return clean.endsWith(cleanProt) || cleanProt.endsWith(clean);
  });
}

/**
 * Resolve a sessão de chip ideal com base no nicho/categoria.
 */
function resolveChip(categoryOrNiche = '') {
  const norm = String(categoryOrNiche).toLowerCase();
  if (norm.includes('ouro') || norm.includes('joialheria') || norm.includes('joia') || norm.includes('semijoia')) {
    return CHIP_ROUTING.OURO;
  }
  return CHIP_ROUTING.AGRO;
}

/**
 * Força a pausa de 6 minutos (360s) entre disparos no mesmo chip.
 */
async function enforceChipInterval(sessionId, minSeconds = 360) {
  const lastTime = lastChipSentAt[sessionId] || 0;
  const now = Date.now();
  const elapsedSeconds = (now - lastTime) / 1000;

  if (lastTime > 0 && elapsedSeconds < minSeconds) {
    const remainingSeconds = Math.ceil(minSeconds - elapsedSeconds);
    console.log(`⏳ [Chip Guard] Aguardando ${remainingSeconds}s para atingir o intervalo seguro de 6 min no chip ${sessionId}...`);
    await new Promise((resolve) => setTimeout(resolve, remainingSeconds * 1000));
  }
}

/**
 * Registra o timestamp do envio efetuado no chip.
 */
function recordChipSent(sessionId) {
  lastChipSentAt[sessionId] = Date.now();
}

/**
 * Busca leads pendentes no Supabase.
 */
async function fetchPendingLeadsFromSupabase(limit = 10) {
  const { url, key } = getSupabaseCredentials();
  const res = await fetch(`${url}/rest/v1/leads?select=*&status=eq.pending&limit=${limit}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao buscar leads no Supabase (${res.status}): ${errText}`);
  }

  const leads = await res.json();
  // Filtrar contatos protegidos
  return leads.filter((l) => !isProtectedPhone(l.phone));
}

/**
 * Atualiza o status e metadados de um lead no Supabase.
 */
async function updateLeadInSupabase(phone, updates = {}) {
  const { url, key } = getSupabaseCredentials();
  const cleanPhone = String(phone).replace(/\D/g, '');

  const res = await fetch(`${url}/rest/v1/leads?phone=eq.${cleanPhone}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`⚠️ Erro ao atualizar lead ${phone} no Supabase:`, errText);
  } else {
    console.log(`✅ Lead ${phone} atualizado com sucesso no Supabase!`);
  }

  // Sincroniza reflexivamente com Obsidian para atualização visual
  triggerObsidianSync();
}

/**
 * Dispara a sincronização reflexa com arquivos Obsidian.
 */
function triggerObsidianSync() {
  try {
    execSync('node scripts/sync-obsidian.js', { stdio: 'ignore' });
  } catch (err) {
    // Ignorar erros silenciosos de sync
  }
}

module.exports = {
  isProtectedPhone,
  resolveChip,
  enforceChipInterval,
  recordChipSent,
  fetchPendingLeadsFromSupabase,
  updateLeadInSupabase,
  triggerObsidianSync,
};
