import { Injectable } from '@nestjs/common';
import { createLogger } from '../services/logger.service';

export interface SecretAccessLog {
  keyName: string;
  accessedAt: string;
  source: string;
  isFallback: boolean;
}

@Injectable()
export class VaultSecretsService {
  private readonly logger = createLogger('VaultSecretsService');
  private readonly accessLogs: SecretAccessLog[] = [];

  private get vaultAddress(): string {
    return process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
  }

  private get vaultToken(): string | undefined {
    return process.env.VAULT_TOKEN;
  }

  /**
   * Obtém um segredo do Vault ou realiza fallback seguro para variáveis de ambiente com log de auditoria.
   */
  async getSecret(keyName: string): Promise<string | undefined> {
    const now = new Date().toISOString();

    // Se o token e endereço do Vault estiverem configurados, tenta buscar via API Vault
    if (this.vaultToken && process.env.USE_VAULT === 'true') {
      try {
        const response = await fetch(`${this.vaultAddress}/v1/secret/data/openwa/${keyName}`, {
          headers: {
            'X-Vault-Token': this.vaultToken,
          },
        });

        if (response.ok) {
          const body = (await response.json()) as { data?: { data?: { value?: string }; value?: string } };
          const secretValue = body?.data?.data?.value || body?.data?.value;
          if (secretValue) {
            this.recordAccess(keyName, now, 'HashiCorp Vault HA Cluster', false);
            return String(secretValue);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`⚠️ Falha ao conectar ao Vault em ${this.vaultAddress}: ${errMsg}. Ativando fallback...`);
      }
    }

    // Fallback auditado para env vars
    const envValue = process.env[keyName];
    this.recordAccess(keyName, now, 'Environment Variable (Encrypted at rest)', true);
    return envValue;
  }

  private recordAccess(keyName: string, accessedAt: string, source: string, isFallback: boolean): void {
    const entry: SecretAccessLog = { keyName, accessedAt, source, isFallback };
    this.accessLogs.push(entry);
    this.logger.log(`[Secret Audit Trail] Acesso à chave "${keyName}" via ${source} (Fallback: ${isFallback})`);
  }

  /**
   * Retorna os registros de auditoria de acesso aos segredos da aplicação.
   */
  getSecretAccessLogs(): SecretAccessLog[] {
    return [...this.accessLogs];
  }
}
