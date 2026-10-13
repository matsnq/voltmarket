const crypto = require('crypto');
const config = require('../config');

const KEY = Buffer.from(config.fieldEncryptionKey, 'hex');
if (KEY.length !== 32) {
  throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
}

// AES-256-GCM field-level encryption for PII at rest.
// Output format: base64(iv).base64(authTag).base64(ciphertext)
function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function decryptField(payload) {
  if (payload === null || payload === undefined || payload === '') return null;
  const [iv, tag, data] = String(payload)
    .split('.')
    .map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// One-way hash for storing refresh tokens / reset tokens (never store raw tokens).
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Blind index for encrypted columns that still need equality lookups.
// AES-GCM is randomised, so ciphertext cannot be compared; this keyed hash is
// deterministic for the same input. It is HMAC rather than a bare hash so an
// attacker holding the database cannot brute-force common values (such as
// email addresses) without also holding the key.
function blindIndex(value) {
  return crypto
    .createHmac('sha256', KEY)
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { encryptField, decryptField, sha256, blindIndex, randomToken };
