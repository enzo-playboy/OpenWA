import { Controller, Get, Post, Body, Query, Req, Res, HttpStatus, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { InstagramService } from './instagram.service';

@Controller('webhook/instagram')
export class InstagramController {
  private readonly logger = new Logger(InstagramController.name);

  constructor(
    private configService: ConfigService,
    private instagramService: InstagramService,
    @Inject(forwardRef(() => AiAgentService))
    private aiAgentService: AiAgentService
  ) {}

  /**
   * Endpoint obrigatório para validação inicial do Webhook no painel da Meta
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response
  ) {
    const verifyToken = this.configService.get<string>('IG_VERIFY_TOKEN') || 'openwa_ig_webhook_secret_2026';

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook do Instagram verificado com sucesso.');
      return res.status(HttpStatus.OK).send(challenge);
    } else {
      this.logger.warn('Falha na verificação do Webhook do Instagram.');
      return res.sendStatus(HttpStatus.FORBIDDEN);
    }
  }

  /**
   * Endpoint que recebe os eventos (Mensagens recebidas) do Instagram
   */
  @Post()
  async handleIncomingMessage(@Body() body: any, @Res() res: Response) {
    // Retorna OK o mais rápido possível para a Meta não reenviar o webhook
    res.sendStatus(HttpStatus.OK);

    if (body.object === 'instagram') {
      for (const entry of body.entry) {
        if (!entry.messaging) continue;

        for (const event of entry.messaging) {
          if (event.message && !event.message.is_echo) {
            const senderId = event.sender.id;
            const text = event.message.text;

            this.logger.log(`Mensagem recebida do IG (${senderId}): ${text}`);
            
            // Passa para o AI Agent repassar para a Sofia, identificando com o sufixo @ig
            // O sessionId é fixo "ig_session" para o AI Service
            try {
              // Usamos um @ig suffix pra diferenciar do @c.us do WhatsApp
              await this.aiAgentService.handleInboundLeadMessage('ig_session', `${senderId}@ig`, text);
            } catch (err: any) {
              this.logger.error(`Erro ao processar mensagem do IG no AI Agent: ${err.message}`);
            }
          }
        }
      }
    }
  }
}
