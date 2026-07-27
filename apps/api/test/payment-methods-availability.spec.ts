import { resolveCustomerPaymentMethods } from '../src/payments/payment-methods-availability';

/**
 * F-01. Чекаут витрины хардкодил пять способов оплаты и ничего не знал о том,
 * что сервер реально умеет провести. В проде это давало тупик: песочный
 * провайдер создавал intent, а подтверждение было выключено
 * (`PAYMENTS_SANDBOX_CONFIRM_ENABLED` не задан), поэтому web-заказ навсегда
 * оставался в `awaiting_payment`. Покупатель выбирал «Картой» и терял заказ.
 *
 * Ключевой случай — третий: песочница БЕЗ включённого подтверждения это не
 * «онлайн-оплата работает», а именно тупик, и отдавать её витрине нельзя.
 */
describe('resolveCustomerPaymentMethods', () => {
  const env = (vars: Record<string, string | undefined>) => (name: string) => vars[name];

  it('оплата при получении доступна всегда — она не зависит от шлюза', () => {
    for (const provider of ['none', 'sandbox', 'production'] as const) {
      const result = resolveCustomerPaymentMethods(provider, env({}));
      expect(result.methods).toContain('cash');
    }
  });

  it('provider=none — онлайна нет, и это рабочее состояние, а не поломка', () => {
    const result = resolveCustomerPaymentMethods('none', env({}));
    expect(result.online).toBe(false);
    expect(result.methods).toEqual(['cash']);
  });

  it('песочница без подтверждения — тупик, онлайн не предлагаем', () => {
    const result = resolveCustomerPaymentMethods('sandbox', env({}));
    expect(result.online).toBe(false);
    expect(result.methods).toEqual(['cash']);
  });

  it('песочница с подтверждением — онлайн можно довести до конца', () => {
    const result = resolveCustomerPaymentMethods('sandbox', env({ PAYMENTS_SANDBOX_CONFIRM_ENABLED: 'true' }));
    expect(result.online).toBe(true);
    expect(result.methods).toEqual(expect.arrayContaining(['cash', 'card', 'qr_mbank', 'qr_odengi']));
  });

  it('боевой провайдер — онлайн доступен', () => {
    const result = resolveCustomerPaymentMethods('production', env({}));
    expect(result.online).toBe(true);
    expect(result.methods).toContain('card');
  });

  it('не предлагает покупателю то, что берут только на кассе', () => {
    const result = resolveCustomerPaymentMethods('production', env({}));
    // bakai_pos/obank — эквайринг на прилавке, gift_card идёт отдельным потоком.
    expect(result.methods).not.toContain('bakai_pos');
    expect(result.methods).not.toContain('obank');
    expect(result.methods).not.toContain('gift_card');
  });
});
