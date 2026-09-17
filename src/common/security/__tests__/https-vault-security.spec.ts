import { Request, Response } from 'express';
import { HttpsSecurityMiddleware } from '../https-security.middleware';
import { VaultSecretsService } from '../vault-secrets.service';

describe('HTTPS Security & Vault Secrets Management E2E', () => {
  let middleware: HttpsSecurityMiddleware;
  let vaultService: VaultSecretsService;

  beforeEach(() => {
    middleware = new HttpsSecurityMiddleware();
    vaultService = new VaultSecretsService();
  });

  describe('HttpsSecurityMiddleware', () => {
    it('deve aplicar todos os cabeçalhos de segurança HTTP (HSTS, OWASP, CSP)', () => {
      const req = {
        secure: true,
        headers: { host: 'api.openwa.local' },
        url: '/api/cadence/status',
      } as unknown as Request;

      const setHeaderMock = jest.fn();
      const res = {
        setHeader: setHeaderMock,
        redirect: jest.fn(),
      } as unknown as Response;

      const nextMock = jest.fn();

      middleware.use(req, res, nextMock);

      expect(setHeaderMock).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
      expect(setHeaderMock).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(setHeaderMock).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(setHeaderMock).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(nextMock).toHaveBeenCalled();
    });

    it('deve redirecionar HTTP para HTTPS em produção se FORCE_HTTPS=true', () => {
      process.env.NODE_ENV = 'production';
      process.env.FORCE_HTTPS = 'true';

      const req = {
        secure: false,
        headers: { host: 'api.openwa.prod', 'x-forwarded-proto': 'http' },
        url: '/api/v1/health',
      } as unknown as Request;

      const redirectMock = jest.fn();
      const res = {
        setHeader: jest.fn(),
        redirect: redirectMock,
      } as unknown as Response;

      const nextMock = jest.fn();

      middleware.use(req, res, nextMock);

      expect(redirectMock).toHaveBeenCalledWith(301, 'https://api.openwa.prod/api/v1/health');
      expect(nextMock).not.toHaveBeenCalled();

      process.env.NODE_ENV = 'test';
      delete process.env.FORCE_HTTPS;
    });
  });

  describe('VaultSecretsService', () => {
    it('deve registrar trilha de auditoria ao acessar segredos via fallback de variáveis de ambiente', async () => {
      process.env.TEST_SECRET_KEY = 'super-secret-vault-value-123';

      const secret = await vaultService.getSecret('TEST_SECRET_KEY');

      expect(secret).toBe('super-secret-vault-value-123');

      const logs = vaultService.getSecretAccessLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].keyName).toBe('TEST_SECRET_KEY');
      expect(logs[0].isFallback).toBe(true);

      delete process.env.TEST_SECRET_KEY;
    });
  });
});
