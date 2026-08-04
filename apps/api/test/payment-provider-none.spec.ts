import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectPaymentGatewayProvider } from '../src/payments/payment-gateway-selector';

/**
 * «Онлайн-оплата не подключена» — рабочее состояние, а не поломка.
 *
 * Боевой адаптер (`production-payment-gateway.provider.ts`) — заглушка: договора
 * с провайдером нет, и все его методы бросают. Из-за этого магазин мог работать
 * только в песочнице, то есть в демо-режиме, где заказ не бронирует слот
 * доставки и не списывает промокод.
 *
 * Но продавать за наличные при получении можно без всякого шлюза. Режим `none`
 * даёт ровно это: онлайн-оплата честно недоступна, магазин живой.
 *
 * Отличие от production-заглушки принципиально и должно быть видно по коду
 * ошибки: та означает «не доделано», эта — «так задумано».
 */
describe('Payment gateway selector', () => {
  const select = (values: Record<string, string> = {}) =>
    selectPaymentGatewayProvider((name) => values[name]);

  const intent = {
    orderId: 'order-1',
    orderStatus: 'awaiting_payment' as const,
    method: 'card' as const,
    amount: 100_000,
  };

  it('выбирает провайдера «оплата только при получении»', () => {
    expect(select({ PAYMENT_PROVIDER: 'none' }).name).toBe('none');
  });

  it('отказывает в онлайн-оплате понятным кодом, а не пятисоткой', () => {
    const gateway = select({ PAYMENT_PROVIDER: 'none' });

    expect(() => gateway.assertOperational()).toThrow(/не подключена/i);
    // Бросок синхронный, а не отклонённый промис — ровно как у
    // `ProductionPaymentGatewayProvider`. Расхождение между двумя заглушками
    // было бы хуже общего изъяна: вызывающий не смог бы полагаться ни на одну.
    // Сам изъян (сигнатура обещает Promise, а метод бросает до его создания,
    // поэтому `.catch()` не сработает) записан в BACKLOG как общий для обеих.
    expect(() => gateway.createIntent(intent)).toThrow(
      expect.objectContaining({ response: { code: 'online_payments_unavailable', message: expect.any(String) } }),
    );
  });

  it('по-прежнему отвергает незнакомое значение', () => {
    expect(() => select({ PAYMENT_PROVIDER: 'mbank-direct' }))
      .toThrow(/Unsupported PAYMENT_PROVIDER/);
  });

  /**
   * Урок T7: юнит-тест против выдуманных значений не ловит расхождение кода с
   * конфигом. `SMS_PROVIDER=silent` был покрыт «полностью» — и всё равно ронял
   * контейнер при старте, потому что ни один тест не читал сам блюпринт.
   */
  it('принимает каждое значение PAYMENT_PROVIDER из render.yaml под NODE_ENV=production', () => {
    const blueprint = readFileSync(join(__dirname, '../../../render.yaml'), 'utf8');
    const declared = [...new Set(
      [...blueprint.matchAll(/key:\s*PAYMENT_PROVIDER\s*\n\s*value:\s*(.+)/g)]
        .map((match) => match[1].trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean),
    )];

    expect(declared.length).toBeGreaterThan(0);
    for (const value of declared) {
      expect(() => select({ PAYMENT_PROVIDER: value, NODE_ENV: 'production' })).not.toThrow();
    }
  });
});
