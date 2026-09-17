import { LgpdComplianceService } from './lgpd-compliance.service';
import { encryptData, decryptData, reEncryptData } from './encryption.util';

describe('LGPD Compliance & Key Rotation E2E', () => {
  let lgpdService: LgpdComplianceService;

  beforeEach(() => {
    lgpdService = new LgpdComplianceService();
  });

  describe('LGPD Art. 17 - Right to Deletion & Anonymization', () => {
    it('deve anonimizar dados de lead removendo PII', () => {
      const mockLead = {
        id: 'lead-123',
        phone: '5511981381228',
        name: 'Cliente Teste',
        email: 'cliente@teste.com',
      };

      const anonymized = lgpdService.anonymizeLeadData(mockLead);

      expect(anonymized.name).toBe('[DELETED_LGPD_ART_17]');
      expect(anonymized.phone).toBe('00000000000');
      expect(anonymized.status).toBe('lgpd_anonymized');
      expect(anonymized.metadata?.anonymized).toBe(true);
    });

    it('deve agendar solicitação de exclusão com prazo de 15 dias', () => {
      const request = lgpdService.processDeletionRequest('lead-123');

      expect(request.status).toBe('deletion_requested');
      expect(request.leadId).toBe('lead-123');
      expect(new Date(request.willBeDeletedAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('LGPD Art. 48 - Data Breach Protocol', () => {
    it('deve iniciar protocolo de vazamento com prazos regulatórios', () => {
      const incident = {
        source: 'POSTGRES_UNAUTHORIZED_ACCESS',
        compromisedFields: ['phone', 'email'],
        affectedRecordsCount: 1500,
      };

      const report = lgpdService.initiateBreachProtocol(incident);

      expect(report.status).toBe('BREACH_PROTOCOL_INITIATED');
      expect(new Date(report.anpdNotificationDeadline).getTime()).toBeGreaterThan(Date.now());
      expect(new Date(report.userNotificationDeadline).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Encryption Key Rotation & Versioning', () => {
    it('deve criptografar com v1 e permitir re-encriptação para v2', () => {
      const rawText = '+5511999998888';
      const encryptedV1 = encryptData(rawText, 'v1');

      expect(encryptedV1.startsWith('v1:')).toBe(true);
      expect(decryptData(encryptedV1)).toBe(rawText);

      // Re-encriptação para v2
      process.env.ENCRYPTION_MASTER_KEY_V2 = 'secret-v2-master-key-32b-testing';
      const encryptedV2 = reEncryptData(encryptedV1, 'v2');

      expect(encryptedV2.startsWith('v2:')).toBe(true);
      expect(decryptData(encryptedV2)).toBe(rawText);
    });
  });
});
