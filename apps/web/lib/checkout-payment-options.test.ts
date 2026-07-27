import { describe, expect, it } from 'vitest';
import { resolveCheckoutPaymentOptions } from './checkout-payment-options';

/**
 * F-01. Чекаут держал пять способов оплаты константой и ничего не знал о том,
 * что сервер умеет провести. В проде песочный провайдер создавал intent, а
 * подтверждение было выключено — покупатель выбирал «Картой» и заказ навсегда
 * оставался в `awaiting_payment`.
 *
 * Отдельный край, который нельзя пропустить: экспресс-доставка запрещает оплату
 * при получении (`cashAllowed = delivery !== 'express'`). Если при этом нет и
 * онлайна, платить нечем вообще — это надо сказать вслух, а не оставить пустой
 * список кнопок.
 */
describe('resolveCheckoutPaymentOptions', () => {
  it('онлайн доступен — предлагаем всё, что умеет сервер', () => {
    const r = resolveCheckoutPaymentOptions({
      serverMethods: ['cash', 'card', 'qr_mbank', 'qr_odengi', 'installment'],
      online: true,
      cashAllowed: true,
    });
    expect(r.options).toEqual(['cash', 'card', 'qr_mbank', 'qr_odengi', 'installment']);
    expect(r.blocked).toBe(false);
    expect(r.notice).toBeNull();
  });

  it('онлайна нет — только оплата при получении, и об этом сказано', () => {
    const r = resolveCheckoutPaymentOptions({ serverMethods: ['cash'], online: false, cashAllowed: true });
    expect(r.options).toEqual(['cash']);
    expect(r.blocked).toBe(false);
    expect(r.notice).toMatch(/при получении/iu);
  });

  it('экспресс запрещает наличные — онлайн остаётся', () => {
    const r = resolveCheckoutPaymentOptions({
      serverMethods: ['cash', 'card', 'qr_mbank'],
      online: true,
      cashAllowed: false,
    });
    expect(r.options).toEqual(['card', 'qr_mbank']);
    expect(r.blocked).toBe(false);
  });

  it('экспресс без онлайна — платить нечем, и это названо прямо', () => {
    const r = resolveCheckoutPaymentOptions({ serverMethods: ['cash'], online: false, cashAllowed: false });
    expect(r.options).toEqual([]);
    expect(r.blocked).toBe(true);
    expect(r.notice).toMatch(/экспресс/iu);
  });

  it('сервер не ответил — не выдумываем способы, ведём на оплату при получении', () => {
    const r = resolveCheckoutPaymentOptions({ serverMethods: null, online: false, cashAllowed: true });
    expect(r.options).toEqual(['cash']);
    expect(r.blocked).toBe(false);
  });

  it('не показываем способ, которого сервер не назвал', () => {
    const r = resolveCheckoutPaymentOptions({
      serverMethods: ['cash', 'card'],
      online: true,
      cashAllowed: true,
    });
    expect(r.options).not.toContain('qr_mbank');
    expect(r.options).not.toContain('installment');
  });
});
