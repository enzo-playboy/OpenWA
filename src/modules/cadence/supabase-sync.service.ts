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
}
