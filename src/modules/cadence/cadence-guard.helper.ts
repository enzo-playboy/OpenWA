import * as crypto from 'crypto';

/**
 * Cadence Guard Helper
 * Centraliza as regras críticas de prospecção, roteamento por chip,
 * trava de tempo de 6 minutos (360s), contatos em atendimento manual,
 * telemetria (GuardMetrics), failover de chip, rate limiting, deduplicação de webhooks
 * e lock de concorrência por chip.
 */

export const PROTECTED_MANUAL_PHONES = ['5511981381228', '+5511981381228', '5511930539183', '+5511930539183'];

export const CHIP_CONFIGS = {
  CHIP_2_OURO: {
    sessionId: '764ba619-c986-4b7b-bea8-fa67c2845b01',
    name: 'chip-2-iphone (Proxy TOR)',
    useProxy: true,
    niches: ['joalheria', 'ouro', 'semijoia', 'joias', 'relogio', 'semijoias'],
  },
  CHIP_1_AGRO: {
    sessionId: '84e58e30-9c99-4eb5-8e27-c6604778d1cd',
    name: 'suportew (Agro)',
    useProxy: false,
    niches: ['irrigacao', 'agro', 'sementes', 'nutricao', 'foliar', 'hidrica', 'racao', 'pecuaria'],
  },
};

export const MIN_DISPATCH_INTERVAL_SECONDS = 360; // 6 minutos
export const MAX_MESSAGES_PER_MINUTE = 20;

export interface GuardMetrics {
  protected_contacts_blocked: number;
  chip_interval_rejections: number;
  rate_limit_rejections: number;
  duplicate_webhooks_ignored: number;
  concurrency_lock_conflicts: number;
  dispatches_recorded: number;
  chip_failover_count: number;
  last_sent_timestamps: Record<string, string>;
}

// Registro de estado em memória
const lastSentTimestamps: Record<string, number> = {};
const chipDispatchWindows: Record<string, number[]> = {};
const webhookFingerprints: Record<string, number> = {};
const chipLocks: Record<string, { lockId: string; expiresAt: number }> = {};

const metrics: GuardMetrics = {
  protected_contacts_blocked: 0,
  chip_interval_rejections: 0,
  rate_limit_rejections: 0,
  duplicate_webhooks_ignored: 0,
  concurrency_lock_conflicts: 0,
  dispatches_recorded: 0,
  chip_failover_count: 0,
  last_sent_timestamps: {},
};

/**
 * Retorna uma cópia das métricas atuais dos guards para monitoramento/telemetria.
 */
export function getGuardMetrics(): GuardMetrics {
  const timestampsFormatted: Record<string, string> = {};
  Object.entries(lastSentTimestamps).forEach(([sessionId, timestampMs]) => {
    timestampsFormatted[sessionId] = new Date(timestampMs).toISOString();
  });

  return {
    ...metrics,
    last_sent_timestamps: timestampsFormatted,
  };
}

/**
 * Reinicia as métricas e histórico em memória (para testes unitários/E2E).
 */
export function resetGuardMetrics(): void {
  metrics.protected_contacts_blocked = 0;
  metrics.chip_interval_rejections = 0;
  metrics.rate_limit_rejections = 0;
  metrics.duplicate_webhooks_ignored = 0;
  metrics.concurrency_lock_conflicts = 0;
  metrics.dispatches_recorded = 0;
  metrics.chip_failover_count = 0;
  metrics.last_sent_timestamps = {};

  Object.keys(lastSentTimestamps).forEach(key => delete lastSentTimestamps[key]);
  Object.keys(chipDispatchWindows).forEach(key => delete chipDispatchWindows[key]);
  Object.keys(webhookFingerprints).forEach(key => delete webhookFingerprints[key]);
  Object.keys(chipLocks).forEach(key => delete chipLocks[key]);
}

/**
 * Verifica se um número de telefone está sob guarda de atendimento manual.
 */
export function isProtectedContact(phone: string): boolean {
  if (!phone) return false;
  const cleanPhone = phone.replace(/\D/g, '');
  const isProtected = PROTECTED_MANUAL_PHONES.some(protectedNum => {
    const cleanProtected = protectedNum.replace(/\D/g, '');
    return cleanPhone.endsWith(cleanProtected) || cleanProtected.endsWith(cleanPhone);
  });

  if (isProtected) {
    metrics.protected_contacts_blocked++;
  }

  return isProtected;
}

/**
 * Resolve o chip correto com base no nicho/categoria do lead e status de sessões ativas (failover).
 */
export function resolveChipForNiche(
  nicheOrCategory: string = '',
  activeSessionIds?: string[],
): {
  sessionId: string;
  chipName: string;
  useProxy: boolean;
  isFailover: boolean;
  isAvailable: boolean;
} {
  const normalized = (nicheOrCategory || '').toLowerCase();
  const isOuro = CHIP_CONFIGS.CHIP_2_OURO.niches.some(keyword => normalized.includes(keyword));

  const primaryConfig = isOuro ? CHIP_CONFIGS.CHIP_2_OURO : CHIP_CONFIGS.CHIP_1_AGRO;
  const fallbackConfig = isOuro ? CHIP_CONFIGS.CHIP_1_AGRO : CHIP_CONFIGS.CHIP_2_OURO;

  if (activeSessionIds && Array.isArray(activeSessionIds)) {
    const isPrimaryActive = activeSessionIds.includes(primaryConfig.sessionId);

    if (!isPrimaryActive) {
      const isFallbackActive = activeSessionIds.includes(fallbackConfig.sessionId);

      if (isFallbackActive) {
        metrics.chip_failover_count++;
        return {
          sessionId: fallbackConfig.sessionId,
          chipName: `${fallbackConfig.name} (Failover)`,
          useProxy: fallbackConfig.useProxy,
          isFailover: true,
          isAvailable: true,
        };
      }

      return {
        sessionId: primaryConfig.sessionId,
        chipName: primaryConfig.name,
        useProxy: primaryConfig.useProxy,
        isFailover: false,
        isAvailable: false,
      };
    }
  }

  return {
    sessionId: primaryConfig.sessionId,
    chipName: primaryConfig.name,
    useProxy: primaryConfig.useProxy,
    isFailover: false,
    isAvailable: true,
  };
}

/**
 * Valida se o intervalo mínimo entre envios (360s) foi respeitado para um determinado chip.
 */
export function validateChipInterval(
  sessionId: string,
  minSeconds: number = MIN_DISPATCH_INTERVAL_SECONDS,
  nowTimestampMs: number = Date.now(),
): { valid: boolean; remainingSeconds: number } {
  const lastSentMs = lastSentTimestamps[sessionId] || 0;
  const elapsedMs = nowTimestampMs - lastSentMs;
  const minMs = minSeconds * 1000;

  if (lastSentMs > 0 && elapsedMs < minMs) {
    const remainingSeconds = Math.ceil((minMs - elapsedMs) / 1000);
    metrics.chip_interval_rejections++;
    return { valid: false, remainingSeconds };
  }

  return { valid: true, remainingSeconds: 0 };
}

/**
 * Valida se o limite de envios por minuto por chip (Max 20 msgs/min) não foi excedido (Rate Limiting).
 */
export function validateChipRateLimit(
  sessionId: string,
  maxPerMinute: number = MAX_MESSAGES_PER_MINUTE,
  nowTimestampMs: number = Date.now(),
): { allowed: boolean; currentCount: number } {
  const windowMs = 60 * 1000;
  if (!chipDispatchWindows[sessionId]) {
    chipDispatchWindows[sessionId] = [];
  }

  // Filtra timestamps dentro da janela de 60 segundos
  chipDispatchWindows[sessionId] = chipDispatchWindows[sessionId].filter(ts => nowTimestampMs - ts < windowMs);

  const currentCount = chipDispatchWindows[sessionId].length;
  if (currentCount >= maxPerMinute) {
    metrics.rate_limit_rejections++;
    return { allowed: false, currentCount };
  }

  return { allowed: true, currentCount };
}

/**
 * Deduplica eventos de webhooks repetidos nos últimos X segundos (padrão: 5 minutos).
 */
export function isDuplicateWebhook(
  payload: { from: string; text?: string; timestamp?: string | number },
  ttlSeconds: number = 300,
  nowTimestampMs: number = Date.now(),
): boolean {
  if (!payload || !payload.from) return false;

  const rawString = `${payload.from}:${payload.text || ''}:${payload.timestamp || ''}`;
  const fingerprint = crypto.createHash('sha256').update(rawString).digest('hex');

  // Limpa impressões expiradas
  const ttlMs = ttlSeconds * 1000;
  Object.keys(webhookFingerprints).forEach(key => {
    if (nowTimestampMs - webhookFingerprints[key] > ttlMs) {
      delete webhookFingerprints[key];
    }
  });

  if (webhookFingerprints[fingerprint]) {
    metrics.duplicate_webhooks_ignored++;
    return true;
  }

  webhookFingerprints[fingerprint] = nowTimestampMs;
  return false;
}

/**
 * Adquire lock de concorrência distribuído por chip (para serialização entre workers).
 */
export function acquireChipLock(
  sessionId: string,
  ttlMs: number = 15000,
  nowTimestampMs: number = Date.now(),
): string | null {
  const currentLock = chipLocks[sessionId];

  if (currentLock && currentLock.expiresAt > nowTimestampMs) {
    metrics.concurrency_lock_conflicts++;
    return null; // Bloqueado por outro processo/worker
  }

  const lockId = crypto.randomUUID();
  chipLocks[sessionId] = {
    lockId,
    expiresAt: nowTimestampMs + ttlMs,
  };

  return lockId;
}

/**
 * Libera o lock de concorrência por chip.
 */
export function releaseChipLock(sessionId: string, lockId: string): boolean {
  const currentLock = chipLocks[sessionId];
  if (currentLock && currentLock.lockId === lockId) {
    delete chipLocks[sessionId];
    return true;
  }
  return false;
}

/**
 * Registra o timestamp do envio efetuado no chip e incrementa a janela de rate limit.
 */
export function recordChipSentTimestamp(sessionId: string, timestampMs: number = Date.now()): void {
  lastSentTimestamps[sessionId] = timestampMs;
  if (!chipDispatchWindows[sessionId]) {
    chipDispatchWindows[sessionId] = [];
  }
  chipDispatchWindows[sessionId].push(timestampMs);
  metrics.dispatches_recorded++;
}

/**
 * Alias de compatibilidade para testes
 */
export function resetChipTimestamps(): void {
  resetGuardMetrics();
}
