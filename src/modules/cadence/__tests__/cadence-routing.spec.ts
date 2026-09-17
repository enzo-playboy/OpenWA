import {
  isProtectedContact,
  resolveChipForNiche,
  validateChipInterval,
  validateChipRateLimit,
  isDuplicateWebhook,
  acquireChipLock,
  releaseChipLock,
  recordChipSentTimestamp,
  resetGuardMetrics,
  getGuardMetrics,
  CHIP_CONFIGS,
  MIN_DISPATCH_INTERVAL_SECONDS,
  MAX_MESSAGES_PER_MINUTE,
} from '../cadence-guard.helper';

describe('Cadence Routing & Security Guards E2E', () => {
  beforeEach(() => {
    resetGuardMetrics();
  });

  describe('isProtectedContact', () => {
    it('deve identificar e bloquear números sob guarda de atendimento manual (Gold Jóias / Lapa)', () => {
      expect(isProtectedContact('+55 11 98138-1228')).toBe(true);
      expect(isProtectedContact('5511981381228')).toBe(true);
      expect(isProtectedContact('+55 11 93053-9183')).toBe(true);
      expect(isProtectedContact('5511930539183')).toBe(true);

      const metrics = getGuardMetrics();
      expect(metrics.protected_contacts_blocked).toBe(4);
    });

    it('deve permitir números normais de prospecção', () => {
      expect(isProtectedContact('+55 34 99876-2935')).toBe(false);
      expect(isProtectedContact('5565998762903')).toBe(false);
    });
  });

  describe('resolveChipForNiche & Failover', () => {
    it('deve rotear nichos de Joalheria, Ouro e Semijoias para o chip-2-iphone (Proxy TOR)', () => {
      const resultOuro = resolveChipForNiche('Joalheria & Ouro 18k');
      expect(resultOuro.sessionId).toBe(CHIP_CONFIGS.CHIP_2_OURO.sessionId);
      expect(resultOuro.useProxy).toBe(true);
      expect(resultOuro.isFailover).toBe(false);
      expect(resultOuro.isAvailable).toBe(true);

      const resultSemijoias = resolveChipForNiche('Semijoias Atacado');
      expect(resultSemijoias.sessionId).toBe(CHIP_CONFIGS.CHIP_2_OURO.sessionId);
    });

    it('deve rotear nichos de Irrigação, Agro e Sementes para o chip suportew', () => {
      const resultAgro = resolveChipForNiche('Irrigação & Soluções Hídricas Agro');
      expect(resultAgro.sessionId).toBe(CHIP_CONFIGS.CHIP_1_AGRO.sessionId);
      expect(resultAgro.useProxy).toBe(false);

      const resultSementes = resolveChipForNiche('Sementes & Nutrição Vegetal');
      expect(resultSementes.sessionId).toBe(CHIP_CONFIGS.CHIP_1_AGRO.sessionId);
    });

    it('deve realizar failover para o chip secundário se o primário estiver offline', () => {
      const activeSessions = [CHIP_CONFIGS.CHIP_1_AGRO.sessionId];

      const resultFailover = resolveChipForNiche('Joalheria Ouro', activeSessions);
      expect(resultFailover.sessionId).toBe(CHIP_CONFIGS.CHIP_1_AGRO.sessionId);
      expect(resultFailover.isFailover).toBe(true);
      expect(resultFailover.isAvailable).toBe(true);

      const metrics = getGuardMetrics();
      expect(metrics.chip_failover_count).toBe(1);
    });

    it('deve sinalizar indisponibilidade se NENHUM chip estiver online', () => {
      const activeSessions: string[] = [];

      const resultUnavailable = resolveChipForNiche('Joalheria Ouro', activeSessions);
      expect(resultUnavailable.isAvailable).toBe(false);
    });
  });

  describe('validateChipInterval (Trava dos 6 minutos / 360s)', () => {
    const sessionId = CHIP_CONFIGS.CHIP_2_OURO.sessionId;

    it('deve permitir envio no chip se nunca tiver disparado antes', () => {
      const check = validateChipInterval(sessionId, MIN_DISPATCH_INTERVAL_SECONDS, 1000000);
      expect(check.valid).toBe(true);
    });

    it('deve bloquear envios no mesmo chip em menos de 360 segundos (6 minutos)', () => {
      const now = 1000000;
      recordChipSentTimestamp(sessionId, now);

      const checkShort = validateChipInterval(sessionId, MIN_DISPATCH_INTERVAL_SECONDS, now + 60 * 1000);
      expect(checkShort.valid).toBe(false);
      expect(checkShort.remainingSeconds).toBe(300);

      const checkAlmost = validateChipInterval(sessionId, MIN_DISPATCH_INTERVAL_SECONDS, now + 359 * 1000);
      expect(checkAlmost.valid).toBe(false);
      expect(checkAlmost.remainingSeconds).toBe(1);

      const metrics = getGuardMetrics();
      expect(metrics.chip_interval_rejections).toBe(2);
    });

    it('deve liberar o envio no chip após decorridos 360 segundos (6 minutos)', () => {
      const now = 1000000;
      recordChipSentTimestamp(sessionId, now);

      const checkExact = validateChipInterval(sessionId, MIN_DISPATCH_INTERVAL_SECONDS, now + 360 * 1000);
      expect(checkExact.valid).toBe(true);
      expect(checkExact.remainingSeconds).toBe(0);
    });
  });

  describe('validateChipRateLimit (Rate Limiting)', () => {
    const sessionId = CHIP_CONFIGS.CHIP_2_OURO.sessionId;

    it('deve bloquear envios se exceder 20 msgs/min no mesmo chip', () => {
      const now = 2000000;

      // Simula 20 disparos dentro de 1 minuto (verificação ANTES do envio)
      for (let i = 0; i < MAX_MESSAGES_PER_MINUTE; i++) {
        const check = validateChipRateLimit(sessionId, MAX_MESSAGES_PER_MINUTE, now + i * 1000);
        expect(check.allowed).toBe(true);
        recordChipSentTimestamp(sessionId, now + i * 1000);
      }

      // Tentativa 21 deve ser bloqueada pelo rate limiter
      const blockedCheck = validateChipRateLimit(sessionId, MAX_MESSAGES_PER_MINUTE, now + 21 * 1000);
      expect(blockedCheck.allowed).toBe(false);

      const metrics = getGuardMetrics();
      expect(metrics.rate_limit_rejections).toBe(1);
    });
  });

  describe('isDuplicateWebhook (Webhook Deduplication)', () => {
    it('deve ignorar webhooks duplicados entregues nos últimos 5 minutos', () => {
      const payload = {
        from: '5511999999999@s.whatsapp.net',
        text: 'Olá, tenho interesse',
        timestamp: 1700000000,
      };

      const firstCall = isDuplicateWebhook(payload, 300, 100000);
      expect(firstCall).toBe(false);

      const duplicateCall = isDuplicateWebhook(payload, 300, 100050);
      expect(duplicateCall).toBe(true);

      const metrics = getGuardMetrics();
      expect(metrics.duplicate_webhooks_ignored).toBe(1);
    });

    it('deve permitir webhooks iguais se decorridos mais de 5 minutos', () => {
      const payload = {
        from: '5511999999999@s.whatsapp.net',
        text: 'Olá, tenho interesse',
        timestamp: 1700000000,
      };

      const now = 100000;
      isDuplicateWebhook(payload, 300, now);

      // Chamada 5 minutos (301 segundos) depois
      const expiredCall = isDuplicateWebhook(payload, 300, now + 301 * 1000);
      expect(expiredCall).toBe(false);
    });
  });

  describe('acquireChipLock & releaseChipLock (Concurrency Lock)', () => {
    const sessionId = CHIP_CONFIGS.CHIP_1_AGRO.sessionId;

    it('deve serializar execuções simultâneas no mesmo chip usando lock/mutex', () => {
      const now = 100000;
      const lock1 = acquireChipLock(sessionId, 15000, now);
      expect(lock1).not.toBeNull();

      // Tentativa simultânea no mesmo chip deve falhar (lock ocupado)
      const lock2 = acquireChipLock(sessionId, 15000, now + 1000);
      expect(lock2).toBeNull();

      const metrics = getGuardMetrics();
      expect(metrics.concurrency_lock_conflicts).toBe(1);

      // Libera o lock
      const released = releaseChipLock(sessionId, lock1!);
      expect(released).toBe(true);

      // Nova tentativa após liberação deve suceder
      const lock3 = acquireChipLock(sessionId, 15000, now + 2000);
      expect(lock3).not.toBeNull();
    });
  });

  describe('GuardMetrics Telemetry', () => {
    it('deve registrar métricas e timestamps em tempo real', () => {
      const sessionId = CHIP_CONFIGS.CHIP_1_AGRO.sessionId;
      const now = 1700000000000;

      recordChipSentTimestamp(sessionId, now);
      isProtectedContact('+5511981381228');

      const metrics = getGuardMetrics();
      expect(metrics.dispatches_recorded).toBe(1);
      expect(metrics.protected_contacts_blocked).toBe(1);
      expect(metrics.last_sent_timestamps[sessionId]).toBe(new Date(now).toISOString());
    });
  });
});
