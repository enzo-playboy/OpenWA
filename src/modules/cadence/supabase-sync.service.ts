import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '../../common/services/logger.service';

export interface SupabaseLead {
  id?: string;
  phone: string;
  name?: string;
  status?: string;
  current_step?: number;
  last_reply_at?: string;
  last_reply_text?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class SupabaseSyncService {
  private readonly logger = createLogger('SupabaseSyncService');

  constructor(private readonly configService: ConfigService) {}

  private get supabaseUrl(): string | undefined {
    return process.env.SUPABASE_URL || this.configService.get<string>('SUPABASE_URL');
  }

  private get supabaseKey(): string | undefined {
    return (
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      this.configService.get<string>('SUPABASE_KEY')
    );
  }

  private get leadsTable(): string {
    return (
      process.env.SUPABASE_LEADS_TABLE ||
      this.configService.get<string>('SUPABASE_LEADS_TABLE') ||
      'leads'
    );
  }

  public isConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseKey);
  }

  /**
   * Buscar leads do Supabase para colocar na régua de prospecção ou para o dashboard.
   */
  async fetchLeadsFromSupabase(limit = 1000, statusFilter?: string): Promise<SupabaseLead[]> {
    if (!this.isConfigured()) {
      this.logger.warn('Supabase not configured (SUPABASE_URL / SUPABASE_KEY missing)');
      return [];
    }

    try {
      const query = statusFilter ? `status=eq.${encodeURIComponent(statusFilter)}&` : '';
      const endpoint = `${this.supabaseUrl}/rest/v1/${this.leadsTable}?${query}select=*&limit=${limit}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          apikey: this.supabaseKey!,
          Authorization: `Bearer ${this.supabaseKey!}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Supabase GET error: ${response.status} ${response.statusText}`);
      }

      const leads = (await response.json()) as SupabaseLead[];
      this.logger.log(`Fetched ${leads.length} leads from Supabase table '${this.leadsTable}'`);
      return leads;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to fetch leads from Supabase: ${errMsg}`);
      return [];
    }
  }

  /**
   * Atualizar status do lead no Supabase à medida que ele avança na régua dos 10 toques.
   */
  async updateLeadStatusInSupabase(phone: string, statusData: Partial<SupabaseLead>): Promise<boolean> {
    if (!this.isConfigured()) return false;

    try {
      const cleanPhone = phone.split('@')[0];
      const endpoint = `${this.supabaseUrl}/rest/v1/${this.leadsTable}?phone=eq.${encodeURIComponent(cleanPhone)}`;

      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          apikey: this.supabaseKey!,
          Authorization: `Bearer ${this.supabaseKey!}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          ...statusData,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        this.logger.error(`Supabase PATCH error: ${response.status} ${response.statusText}`);
        return false;
      }

      this.logger.log(`Updated lead ${cleanPhone} in Supabase with status '${statusData.status ?? ''}'`);
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to update lead ${phone} in Supabase: ${errMsg}`);
      return false;
    }
  }

  /**
   * Atualizar stage e metadata do lead no Supabase pelo id ou telefone.
   */
  async updateLeadStageInSupabase(
    identifier: { id?: string; phone?: string },
    stage: string,
  ): Promise<boolean> {
    if (!this.isConfigured()) return false;

    try {
      const cleanPhone = identifier.phone ? identifier.phone.replace(/\D/g, '') : '';
      const filter = identifier.id
        ? `id=eq.${encodeURIComponent(identifier.id)}`
        : `phone=eq.${encodeURIComponent(cleanPhone)}`;

      // 1. Obter metadata atual para mesclar
      const getUrl = `${this.supabaseUrl}/rest/v1/${this.leadsTable}?${filter}&select=metadata`;
      const getRes = await fetch(getUrl, {
        headers: { apikey: this.supabaseKey!, Authorization: `Bearer ${this.supabaseKey!}` },
      });
      let existingMeta: Record<string, unknown> = {};
      if (getRes.ok) {
        const rows = (await getRes.json()) as Array<{ metadata?: Record<string, unknown> }>;
        if (rows[0]?.metadata) existingMeta = rows[0].metadata;
      }

      const updatedMeta = { ...existingMeta, stage };

      // 2. PATCH status + metadata
      const patchUrl = `${this.supabaseUrl}/rest/v1/${this.leadsTable}?${filter}`;
      const res = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          apikey: this.supabaseKey!,
          Authorization: `Bearer ${this.supabaseKey!}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status: stage,
          metadata: updatedMeta,
          updated_at: new Date().toISOString(),
        }),
      });

      return res.ok;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to update lead stage in Supabase: ${errMsg}`);
      return false;
    }
  }

  /**
   * Criar um novo lead no Supabase pelo backend.
   */
  async createLeadInSupabase(lead: Partial<SupabaseLead>): Promise<SupabaseLead | null> {
    if (!this.isConfigured()) return null;

    try {
      const url = `${this.supabaseUrl}/rest/v1/${this.leadsTable}`;
      const payload = {
        phone: lead.phone,
        name: lead.name ?? lead.phone,
        status: lead.status ?? 'cold',
        metadata: lead.metadata ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: this.supabaseKey!,
          Authorization: `Bearer ${this.supabaseKey!}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.logger.error(`Supabase POST createLead error: ${res.status}`);
        return null;
      }
      const rows = (await res.json()) as SupabaseLead[];
      return rows[0] ?? null;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to create lead in Supabase: ${errMsg}`);
      return null;
    }
  }
}
