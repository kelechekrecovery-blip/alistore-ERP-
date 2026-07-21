import {
  issueGuestCheckoutCapability,
  issueGuestOrderCapability,
  requireGuestCapability,
} from '../src/auth/guest-capability';

/**
 * Второго резолвера секрета быть не должно.
 *
 * `jwt-secret.ts` отказывается работать в проде с dev-значением, и это защищало
 * основные токены. Но гостевые возможности резолвили секрет сами —
 * `process.env.JWT_SECRET ?? 'dev-insecure-change-me'` — без единой проверки.
 * То есть при неверно выставленном окружении гостевой токен подписывался
 * строкой, опубликованной в этом же репозитории, а с ним идут scope'ы
 * `orders:create`, `payments:intent` и `payments:gift_card`.
 *
 * Один секрет — одно место, где можно ошибиться.
 */
describe('гостевые возможности · секрет тот же, что у основных токенов', () => {
  const original = process.env.NODE_ENV;
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = original;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('в проде без секрета — отказ, а не подпись публично известной строкой', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    expect(() => issueGuestCheckoutCapability('customer-1')).toThrow(/JWT_SECRET/);
    expect(() => issueGuestOrderCapability('customer-1', 'order-1')).toThrow(/JWT_SECRET/);
  });

  it('в проде dev-значение отвергается явно', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-insecure-change-me';

    expect(() => issueGuestCheckoutCapability('customer-1')).toThrow(/JWT_SECRET/);
  });

  it('вне прода запасное значение по-прежнему разрешено — dev и тесты не ломаются', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;

    const token = issueGuestCheckoutCapability('customer-1');
    expect(requireGuestCapability(token, 'orders:create', 'customer-1').sub).toBe('customer-1');
  });
});

describe('guest checkout capability', () => {
  it('binds checkout scopes to one customer', () => {
    const token = issueGuestCheckoutCapability('customer-1');
    expect(requireGuestCapability(token, 'orders:create', 'customer-1').sub).toBe('customer-1');
    expect(requireGuestCapability(token, 'payments:intent').scopes).toContain('payments:intent');
    expect(requireGuestCapability(token, 'evidence:write').scopes).toContain('support:create');
    expect(() => requireGuestCapability(token, 'orders:create', 'customer-2'))
      .toThrow('guest_capability_owner_mismatch');
  });

  it('binds read scopes to one order and rejects expired access', () => {
    const token = issueGuestOrderCapability('customer-1', 'order-1');
    expect(requireGuestCapability(token, 'orders:read', undefined, { type: 'order', id: 'order-1' }).sub).toBe('customer-1');
    expect(() => requireGuestCapability(token, 'orders:read', undefined, { type: 'order', id: 'order-2' }))
      .toThrow('guest_capability_entity_mismatch');
    expect(() => requireGuestCapability(issueGuestOrderCapability('customer-1', 'order-1', -1), 'orders:read'))
      .toThrow('guest_capability_invalid');
  });

  it('rejects missing and tampered capabilities', () => {
    expect(() => requireGuestCapability(undefined, 'orders:create'))
      .toThrow('guest_capability_required');
    const token = issueGuestCheckoutCapability('customer-1');
    expect(() => requireGuestCapability(`${token.slice(0, -1)}x`, 'orders:create'))
      .toThrow('guest_capability_invalid');
  });
});
