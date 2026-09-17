import * as crypto from 'crypto';

/**
 * Utilitários de Criptografia em Repouso (AES-256-GCM) com Suporte a Rotação e Versionamento de Chaves (LGPD).
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const DEFAULT_KEY_VERSION = 'v1';

/**
 * Obtém a chave de criptografia de 32 bytes (256 bits) para uma determinada versão.
 */
function getMasterKey(version: string = DEFAULT_KEY_VERSION): Buffer {
  let secret = process.env.ENCRYPTION_MASTER_KEY || process.env.API_MASTER_KEY || 'default-openwa-secure-key-32b';
  if (version !== DEFAULT_KEY_VERSION) {
    secret = process.env[`ENCRYPTION_MASTER_KEY_${version.toUpperCase()}`] || `${secret}_${version}`;
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Criptografa uma string de dados sensíveis (ex: PII / Telefone / Dados de Leads) com versão da chave.
 */
export function encryptData(plaintext: string, keyVersion: string = DEFAULT_KEY_VERSION): string {
  if (!plaintext) return plaintext;

  const key = getMasterKey(keyVersion);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Formato com versão: version:iv_hex:auth_tag_hex:encrypted_hex
  return `${keyVersion}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descriptografa uma string criptografada no formato AES-256-GCM (suporta v1 e legados).
 */
export function decryptData(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return cipherText;

  try {
    const parts = cipherText.split(':');

    let keyVersion = DEFAULT_KEY_VERSION;
    let ivHex: string;
    let authTagHex: string;
    let encryptedHex: string;

    if (parts.length === 4) {
      // Formato versionado: v1:iv:tag:encrypted
      [keyVersion, ivHex, authTagHex, encryptedHex] = parts;
    } else if (parts.length === 3) {
      // Formato legado sem versão: iv:tag:encrypted
      [ivHex, authTagHex, encryptedHex] = parts;
    } else {
      return cipherText;
    }

    const key = getMasterKey(keyVersion);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // Se não for descriptografável, retorna o próprio texto
    return cipherText;
  }
}

/**
 * Rotaciona o ciphertext para uma nova versão de chave mestra.
 */
export function reEncryptData(cipherText: string, newVersion: string): string {
  const plain = decryptData(cipherText);
  return encryptData(plain, newVersion);
}
