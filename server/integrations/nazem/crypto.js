import crypto from 'node:crypto';
import { getDatabaseContext } from '../../db.js';

const SECRET_VERSION = 'v2';

function masterEncryptionKey() {
  const configured = String(process.env.NAZEM_ENCRYPTION_KEY || '').trim();
  if (!configured) {
    const error = new Error('مفتاح تشفير تكامل ناظم غير مهيأ على الخادم.');
    error.statusCode = 503;
    throw error;
  }
  const raw = /^[a-f0-9]{64}$/i.test(configured)
    ? Buffer.from(configured, 'hex')
    : Buffer.from(configured, 'base64');
  if (raw.length !== 32) {
    const error = new Error('مفتاح تشفير تكامل ناظم يجب أن يكون 32 بايت.');
    error.statusCode = 503;
    throw error;
  }
  return raw;
}

function tenantEncryptionKey() {
  const { databaseName } = getDatabaseContext();
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    masterEncryptionKey(),
    Buffer.from(String(databaseName || 'default'), 'utf8'),
    Buffer.from('rawasi:nazem:credentials:v2', 'utf8'),
    32,
  ));
}

export function getNazemEncryptionKeyStatus() {
  try {
    masterEncryptionKey();
    return { ready: true };
  } catch (error) {
    return { ready: false, message: error.message };
  }
}

export function encryptNazemSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tenantEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SECRET_VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptNazemSecret(value) {
  const [version, iv, tag, encrypted] = String(value || '').split('.');
  if (!['v1', SECRET_VERSION].includes(version) || !iv || !tag || encrypted === undefined) {
    throw new Error('صيغة بيانات ناظم المشفرة غير صالحة.');
  }
  const key = version === 'v1' ? masterEncryptionKey() : tenantEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export const encryptNazemJson = (value) => encryptNazemSecret(JSON.stringify(value ?? {}));
export const decryptNazemJson = (value) => JSON.parse(decryptNazemSecret(value));
