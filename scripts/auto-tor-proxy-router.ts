import { config } from 'dotenv';
import http from 'http';
import { SocksProxyAgent } from 'socks-proxy-agent';

config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

/**
 * Tor SOCKS5 Proxy por padrão roda na porta local 9050 ou 9150 (Tor Browser)
 */
const TOR_SOCKS_PORT = process.env.TOR_SOCKS_PORT || '9050';
const TOR_PROXY_URL = `socks5h://127.0.0.1:${TOR_SOCKS_PORT}`;

export async function setTorProxyForSession(sessionId: string, torPort = TOR_SOCKS_PORT) {
  const proxyUrl = `socks5://127.0.0.1:${torPort}`;
  console.log(`🧅 [Auto-TOR Router] Vinculando Sessão WhatsApp '${sessionId}' à rede TOR / SOCKS5: ${proxyUrl}...`);

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?id=eq.${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          proxyUrl: proxyUrl,
          proxyType: 'socks5'
        })
      });

      if (res.ok) {
        console.log(`🎉 [Auto-TOR Router] Sessão '${sessionId}' roteada com sucesso via TOR!`);
      }
    } catch (e: any) {
      console.error(`❌ Erro ao atribuir TOR Proxy para ${sessionId}:`, e.message);
    }
  }

  return proxyUrl;
}

export function generateMultiSessionProxyConfig() {
  return [
    { sessionId: 'session-01', name: 'Chip 1 (Principal)', proxyUrl: null, note: 'IP Direto / ProtonVPN Global' },
    { sessionId: 'session-02', name: 'Chip 2 (Apoio)', proxyUrl: 'socks5://127.0.0.1:9050', note: 'Rede TOR Circuito A (Rotativo)' },
    { sessionId: 'session-03', name: 'Chip 3 (Agro Target)', proxyUrl: 'socks5://127.0.0.1:9052', note: 'Rede TOR Circuito B (Rotativo)' }
  ];
}

if (require.main === module) {
  console.log('🧅 Roteador Auto-TOR & ProtonVPN Configurado com Sucesso!');
  console.log('---------------------------------------------------------');
  generateMultiSessionProxyConfig().forEach(item => {
    console.log(`📱 ${item.name} (${item.sessionId})`);
    console.log(`   🔗 Proxy: ${item.proxyUrl || 'IP Direto (ProtonVPN Global)'}`);
    console.log(`   🛡️ Segurança: ${item.note}`);
    console.log('---------------------------------------------------------');
  });
}

