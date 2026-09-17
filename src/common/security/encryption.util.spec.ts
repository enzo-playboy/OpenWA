import { encryptData, decryptData } from './encryption.util';

describe('Encryption Utility (AES-256-GCM) LGPD Compliance', () => {
  const originalEnv = process.env.ENCRYPTION_MASTER_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-unit-testing-32b';
  });

  afterAll(() => {
    process.env.ENCRYPTION_MASTER_KEY = originalEnv;
  });

  it('deve criptografar e descriptografar dados sensíveis de leads (PII / Telefones)', () => {
    const rawLeadPhone = '+5511981381228';
    const encrypted: string = encryptData(rawLeadPhone);

    expect(encrypted).not.toBe(rawLeadPhone);
    expect(encrypted).toContain(':'); // IV:AuthTag:EncryptedPayload

    const decrypted: string = decryptData(encrypted);
    expect(decrypted).toBe(rawLeadPhone);
  });

  it('deve lidar graciosamente com valores nulos ou vazios', () => {
    expect(encryptData('')).toBe('');
    expect(decryptData('')).toBe('');
  });

  it('deve retornar o próprio texto caso o valor não esteja criptografado no formato esperado', () => {
    const plainText = 'texto-plano-sem-formato-hex';
    expect(decryptData(plainText)).toBe(plainText);
  });
});
