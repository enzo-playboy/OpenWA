import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private pageAccessToken: string;
  private pageId: string;
  private graphApiVersion = 'v20.0';

  constructor(private readonly configService: ConfigService) {
    this.pageAccessToken = this.configService.get<string>('IG_PAGE_ACCESS_TOKEN') || '';
    this.pageId = this.configService.get<string>('IG_PAGE_ID') || '';
  }

  isConfigured(): boolean {
    return !!this.pageAccessToken && !!this.pageId;
  }

  /**
   * Envia uma mensagem direta (DM) para um usuário do Instagram.
   * @param recipientIgId ID do usuário no Instagram (IGID)
   * @param text Texto da mensagem
   */
  async sendMessage(recipientIgId: string, text: string): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Tentativa de envio no Instagram ignorada. Variáveis IG_PAGE_ACCESS_TOKEN ou IG_PAGE_ID não configuradas.',
      );
      return false;
    }

    const url = `https://graph.facebook.com/${this.graphApiVersion}/${this.pageId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.pageAccessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientIgId },
          message: { text },
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`Erro ao enviar mensagem IG para ${recipientIgId}: ${errorData}`);
        return false;
      }

      this.logger.log(`Mensagem enviada com sucesso no IG para ${recipientIgId}.`);
      return true;
    } catch (error: any) {
      this.logger.error(`Exceção ao enviar mensagem IG para ${recipientIgId}: ${error.message}`);
      return false;
    }
  }
}
