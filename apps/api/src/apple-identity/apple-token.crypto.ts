import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENVELOPE_VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

export class AppleTokenCryptoError extends Error {
  readonly code = 'apple_token_crypto_invalid';

  constructor(message = 'apple_token_crypto_invalid') {
    super(message);
    this.name = 'AppleTokenCryptoError';
  }
}

/** Versioned AES-256-GCM envelope encryption for Apple refresh tokens at rest. */
@Injectable()
export class AppleTokenCrypto {
  private readonly activeKeyId: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(config: ConfigService) {
    try {
      this.activeKeyId = config.get<string>('APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID')?.trim() ?? '';
      if (!KEY_ID_PATTERN.test(this.activeKeyId)) throw new Error('invalid active key');
      this.keys = parseKeys(config.get<string>('APPLE_TOKEN_ENCRYPTION_KEYS_JSON'));
      if (!this.keys.has(this.activeKeyId)) throw new Error('unknown active key');
    } catch {
      throw new AppleTokenCryptoError('apple_token_crypto_config_invalid');
    }
  }

  encrypt(cleartext: string, associatedData = ''): string {
    if (!cleartext) throw new AppleTokenCryptoError();
    const key = this.keys.get(this.activeKeyId);
    if (!key) throw new AppleTokenCryptoError();
    try {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(associatedData, 'utf8'));
      const ciphertext = Buffer.concat([
        cipher.update(cleartext, 'utf8'),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return [
        ENVELOPE_VERSION,
        this.activeKeyId,
        iv.toString('base64url'),
        tag.toString('base64url'),
        ciphertext.toString('base64url'),
      ].join('.');
    } catch {
      throw new AppleTokenCryptoError();
    }
  }

  decrypt(envelope: string, associatedData = ''): string {
    try {
      const [version, keyId, ivValue, tagValue, ciphertextValue, extra] = envelope.split('.');
      if (
        extra !== undefined
        || version !== ENVELOPE_VERSION
        || !KEY_ID_PATTERN.test(keyId ?? '')
        || !ivValue
        || !tagValue
        || !ciphertextValue
      ) {
        throw new Error('invalid envelope');
      }
      const key = this.keys.get(keyId);
      if (!key) throw new Error('unknown key');
      const iv = Buffer.from(ivValue, 'base64url');
      const tag = Buffer.from(tagValue, 'base64url');
      const ciphertext = Buffer.from(ciphertextValue, 'base64url');
      if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
        throw new Error('invalid envelope');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(associatedData, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new AppleTokenCryptoError();
    }
  }
}

function parseKeys(serialized: string | undefined): ReadonlyMap<string, Buffer> {
  if (!serialized) throw new Error('missing keys');
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)) throw new Error('invalid keys');
  const keys = new Map<string, Buffer>();
  for (const [keyId, encodedKey] of Object.entries(parsed)) {
    if (!KEY_ID_PATTERN.test(keyId) || typeof encodedKey !== 'string') {
      throw new Error('invalid key');
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== KEY_BYTES || key.toString('base64') !== encodedKey) {
      throw new Error('invalid key');
    }
    keys.set(keyId, key);
  }
  if (keys.size === 0) throw new Error('missing keys');
  return keys;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
