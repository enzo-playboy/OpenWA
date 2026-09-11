// ============================================================
// Supabase REST client — Dashboard Frontend
// Acessa diretamente a API REST do Supabase para o Kanban CRM
// ============================================================

export type KanbanStage =
  | 'cold'
  | 'contacted'
  | 'engaged'
  | 'proposal'
  | 'closed'
  | 'archived';

export interface SupabaseKanbanLead {
  id: string;
  phone: string;
  name?: string | null;
  company?: string | null;
  status?: string | null;
  stage?: KanbanStage | null;
  tags?: string[] | null;
  notes?: string | null;
  current_step?: number | null;
  last_reply_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ── Config ────────────────────────────────────────────────────────────────────
// A URL e a chave são proxiadas pelo backend OpenWA via /api/supabase-config
// para não expor a service_role_key no bundle do frontend.
// Se o endpoint não estiver disponível, tenta as variáveis VITE_ (anon key).

let _supabaseUrl: string | null = null;
let _supabaseKey: string | null = null;
let _leadsTable = 'leads';
let _configFetched = false;

async function ensureConfig(): Promise<{ url: string; key: string; table: string } | null> {
  if (_configFetched && _supabaseUrl && _supabaseKey) {
    return { url: _supabaseUrl, key: _supabaseKey, table: _leadsTable };
  }

  // 1. Try backend proxy endpoint (preferred — uses service_role_key server-side)
  try {
    const apiKey = sessionStorage.getItem('openwa_api_key');
    const apiOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
    // The cadence controller exposes supabase config at /sessions/:id/cadences/supabase-config
    const res = await fetch(`${apiOrigin}/api/sessions/default/cadences/supabase-config`, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
    });
    if (res.ok) {
      const cfg = await res.json() as { configured?: boolean; url?: string; key?: string; table?: string };
      if (cfg.configured && cfg.url && cfg.key) {
        _supabaseUrl = cfg.url;
        _supabaseKey = cfg.key;
        _leadsTable = cfg.table ?? 'leads';
        _configFetched = true;
        return { url: _supabaseUrl, key: _supabaseKey, table: _leadsTable };
      }
    }
  } catch {
    // fall through
  }

  // 2. Fallback to VITE_ env vars (anon key must have RLS policies for leads table)
  const viteUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const viteKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (viteUrl && viteKey) {
    _supabaseUrl = viteUrl;
    _supabaseKey = viteKey;
    _leadsTable = (import.meta.env.VITE_SUPABASE_TABLE as string | undefined) ?? 'leads';
    _configFetched = true;
    return { url: _supabaseUrl, key: _supabaseKey, table: _leadsTable };
  }

  _configFetched = true; // mark as attempted
  return null;
}

// ── REST helpers ──────────────────────────────────────────────────────────────

function headers(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const supabaseKanban = {
  /**
   * Busca todos os leads da tabela (sem filtro de status para mostrar todos os stages).
   */
  async fetchLeads(): Promise<SupabaseKanbanLead[]> {
    const cfg = await ensureConfig();
    if (!cfg) return [];

    try {
      const url = `${cfg.url}/rest/v1/${cfg.table}?select=*&order=created_at.desc&limit=200`;
      const res = await fetch(url, { headers: headers(cfg.key) });
      if (!res.ok) {
        console.error('[supabase] fetchLeads error:', res.status, await res.text());
        return [];
      }
      return (await res.json()) as SupabaseKanbanLead[];
    } catch (err) {
      console.error('[supabase] fetchLeads exception:', err);
      return [];
    }
  },

  /**
   * Atualiza o campo `stage` de um lead pelo seu `id` (UUID) ou `phone`.
   */
  async updateLeadStage(
    identifier: { id?: string; phone?: string },
    stage: KanbanStage,
  ): Promise<boolean> {
    const cfg = await ensureConfig();
    if (!cfg) return false;

    const filter = identifier.id
      ? `id=eq.${encodeURIComponent(identifier.id)}`
      : `phone=eq.${encodeURIComponent(identifier.phone!)}`;

    try {
      const url = `${cfg.url}/rest/v1/${cfg.table}?${filter}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers(cfg.key), Prefer: 'return=minimal' },
        body: JSON.stringify({ stage, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) {
        console.error('[supabase] updateLeadStage error:', res.status, await res.text());
        return false;
      }
      return true;
    } catch (err) {
      console.error('[supabase] updateLeadStage exception:', err);
      return false;
    }
  },

  /**
   * Cria um novo lead na tabela.
   */
  async createLead(
    lead: Omit<SupabaseKanbanLead, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<SupabaseKanbanLead | null> {
    const cfg = await ensureConfig();
    if (!cfg) return null;

    try {
      const url = `${cfg.url}/rest/v1/${cfg.table}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: headers(cfg.key),
        body: JSON.stringify({ ...lead, created_at: new Date().toISOString() }),
      });
      if (!res.ok) {
        console.error('[supabase] createLead error:', res.status, await res.text());
        return null;
      }
      const rows = (await res.json()) as SupabaseKanbanLead[];
      return rows[0] ?? null;
    } catch (err) {
      console.error('[supabase] createLead exception:', err);
      return null;
    }
  },

  /**
   * Atualiza um lead pelo id.
   */
  async updateLead(
    id: string,
    data: Partial<Omit<SupabaseKanbanLead, 'id' | 'created_at'>>,
  ): Promise<boolean> {
    const cfg = await ensureConfig();
    if (!cfg) return false;

    try {
      const url = `${cfg.url}/rest/v1/${cfg.table}?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers(cfg.key), Prefer: 'return=minimal' },
        body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch (err) {
      console.error('[supabase] updateLead exception:', err);
      return false;
    }
  },

  /**
   * Retorna true se o Supabase está configurado e acessível.
   */
  async isConfigured(): Promise<boolean> {
    const cfg = await ensureConfig();
    return cfg !== null;
  },

  /**
   * Reseta o cache de config (para forçar novo fetch).
   */
  resetConfig() {
    _configFetched = false;
    _supabaseUrl = null;
    _supabaseKey = null;
  },
};
