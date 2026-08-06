import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AppleTokenCrypto, AppleTokenCryptoError } from './apple-token.crypto';

describe('AppleTokenCrypto', () => {
  const keyOne = randomBytes(32).toString('base64');
  const keyTwo = randomBytes(32).toString('base64');

  it('round-trips a token with AES-256-GCM and an explicit active key id', () => {
    const crypto = makeCrypto('key-1');
    const envelope = crypto.encrypt('refresh-秘密-🔐', 'apple:subject-1');

    expect(envelope).toMatch(/^v1\.key-1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(envelope).not.toContain('refresh');
    expect(crypto.decrypt(envelope, 'apple:subject-1')).toBe('refresh-秘密-🔐');
  });

  it('uses a fresh nonce for every encryption', () => {
    const crypto = makeCrypto('key-1');
    expect(crypto.encrypt('same-token')).not.toBe(crypto.encrypt('same-token'));
  });

  it('decrypts older envelopes after active-key rotation', () => {
    const oldEnvelope = makeCrypto('key-1').encrypt('old-refresh', 'apple:subject');
    expect(makeCrypto('key-2').decrypt(oldEnvelope, 'apple:subject')).toBe('old-refresh');
  });

  it.each([
    ['tampered ciphertext', (value: string) => {
      const parts = value.split('.');
      const ciphertext = Buffer.from(parts[4], 'base64url');
      ciphertext[0] ^= 1;
      parts[4] = ciphertext.toString('base64url');
      return parts.join('.');
    }, 'apple:subject'],
    ['wrong associated data', (value: string) => value, 'apple:someone-else'],
    ['unknown key id', (value: string) => value.replace('.key-1.', '.missing.'), 'apple:subject'],
  ])('fails closed for %s', (_name, mutate, aad) => {
    const crypto = makeCrypto('key-1');
    const envelope = crypto.encrypt('refresh-secret', 'apple:subject');

    expect(() => crypto.decrypt(mutate(envelope), aad)).toThrow(AppleTokenCryptoError);
  });

  it.each([
    ['', 'empty cleartext'],
    ['v2.key-1.a.b.c', 'unknown envelope version'],
    ['v1.key-1.a.b.c.extra', 'extra envelope segment'],
    ['v1.bad$key.a.b.c', 'invalid key id'],
    ['v1.key-1...c', 'missing envelope segment'],
  ])('fails closed for %s (%s)', (value) => {
    const crypto = makeCrypto('key-1');
    if (value === '') {
      expect(() => crypto.encrypt(value)).toThrow(AppleTokenCryptoError);
    } else {
      expect(() => crypto.decrypt(value)).toThrow(AppleTokenCryptoError);
    }
  });

  it.each([
    ['missing JSON', undefined, 'key-1'],
    ['invalid JSON', '{', 'key-1'],
    ['missing active id', JSON.stringify({ 'key-1': keyOne }), undefined],
    ['unknown active id', JSON.stringify({ 'key-1': keyOne }), 'missing'],
    ['short key', JSON.stringify({ 'key-1': randomBytes(16).toString('base64') }), 'key-1'],
    ['empty key map', '{}', 'key-1'],
    ['invalid key id', JSON.stringify({ 'bad.key': keyOne }), 'bad.key'],
    ['non-string key', JSON.stringify({ 'key-1': 42 }), 'key-1'],
  ])('rejects %s configuration without exposing key material', (_name, keysJson, activeKeyId) => {
    const config = {
      get: (key: string) => key === 'APPLE_TOKEN_ENCRYPTION_KEYS_JSON' ? keysJson : activeKeyId,
    } as ConfigService;

    const error = (() => {
      try {
        return new AppleTokenCrypto(config);
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(AppleTokenCryptoError);
    expect((error as Error).message).toBe('apple_token_crypto_config_invalid');
    expect(JSON.stringify(error)).not.toContain(keyOne);
  });

  function makeCrypto(activeKeyId: string): AppleTokenCrypto {
    const values: Record<string, string> = {
      APPLE_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({
        'key-1': keyOne,
        'key-2': keyTwo,
      }),
      APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: activeKeyId,
    };
    return new AppleTokenCrypto({ get: (key: string) => values[key] } as ConfigService);
  }
});
