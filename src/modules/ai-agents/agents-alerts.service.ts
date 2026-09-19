import { Injectable } from '@nestjs/common';
import { createLogger } from '../../common/services/logger.service';

/**
 * Critical-event alerts for the agent pipeline (Telegram and/or Slack webhook).
 *
 * Events that reach an operator: chip restriction (the 24h suspension), conversation escalation to
 * a human, daily quota exhaustion and LGPD opt-outs during conversation. Everything is best-effort
 * and fire-and-forget: an alert failure must never block the pipeline.
 *
 * Anti-spam: one alert per (kind, key) inside ALERT_DEDUPE_WINDOW_MS. A chip suspension repeated
 * by the engine's re-reports lands once, not once per reconnect.
 *
 * Config (all optional; service is inert when nothing is set):
 *   AGENT_ALERT_TELEGRAM_BOT_TOKEN / AGENT_ALERT_TELEGRAM_CHAT_ID
 *   AGENT_ALERT_SLACK_WEBHOOK_URL
 */

export type AgentAlertKind = 'chip_restriction' | 'escalation' | 'daily_quota' | 'opt_out';

const ALERT_DEDUPE_WINDOW_MS = 30 * 60_000; // one alert per key per 30 min

@Injectable()
export class AgentsAlertsService {
  private readonly logger = createLogger('AgentsAlertsService');
  private readonly lastSentAt = new Map<string, number>();

  private get telegramToken(): string | undefined {
    return process.env.AGENT_ALERT_TELEGRAM_BOT_TOKEN || undefined;
  }

  private get telegramChatId(): string | undefined {
    return process.env.AGENT_ALERT_TELEGRAM_CHAT_ID || undefined;
  }

  private get slackWebhook(): string | undefined {
    return process.env.AGENT_ALERT_SLACK_WEBHOOK_URL || undefined;
  }

  /** Whether any alert channel is configured. */
  get enabled(): boolean {
    return Boolean((this.telegramToken && this.telegramChatId) || this.slackWebhook);
  }

  /**
   * Fire an operator alert. Fire-and-forget; deduped per (kind, key) window.
   * `details` is rendered as short "key: value" lines.
   */
  alert(kind: AgentAlertKind, title: string, details: Record<string, string | number> = {}, dedupeKey = ''): void {
    if (!this.enabled) return;

    const key = `${kind}:${dedupeKey || title}`;
    const now = Date.now();
    const last = this.lastSentAt.get(key) ?? 0;
    if (now - last < ALERT_DEDUPE_WINDOW_MS) return;
    this.lastSentAt.set(key, now);

    const detailLines = Object.entries(details)
      .map(([k, v]) => `• ${k}: ${v}`)
      .join('\n');
    const text = `🤖 [Agentes] ${title}${detailLines ? `\n${detailLines}` : ''}`;

    void this.sendTelegram(text).catch(err =>
      this.logger.warn(`Telegram alert failed: ${err instanceof Error ? err.message : String(err)}`),
    );
    void this.sendSlack(text).catch(err =>
      this.logger.warn(`Slack alert failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  private async sendTelegram(text: string): Promise<void> {
    const token = this.telegramToken;
    const chatId = this.telegramChatId;
    if (!token || !chatId) return;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      throw new Error(`Telegram HTTP ${res.status}`);
    }
  }

  private async sendSlack(text: string): Promise<void> {
    const webhook = this.slackWebhook;
    if (!webhook) return;
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      throw new Error(`Slack HTTP ${res.status}`);
    }
  }
}
