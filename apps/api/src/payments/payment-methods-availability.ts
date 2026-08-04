import { PaymentMethod } from '@prisma/client';

export type PaymentEnvReader = (name: string) => string | undefined;

export interface CustomerPaymentMethods {
  /** Можно ли довести онлайн-оплату до конца, а не только создать intent. */
  online: boolean;
  methods: PaymentMethod[];
}

/**
 * Способы оплаты, которые витрина вправе предложить покупателю.
 *
 * Чекаут держал этот список константой и ничего не знал о том, что сервер реально
 * умеет провести. В проде это давало тупик: песочный провайдер создавал intent, а
 * подтверждение было выключено, поэтому web-заказ навсегда оставался в
 * `awaiting_payment` — покупатель выбирал «Картой» и терял заказ.
 *
 * Отсюда третье правило, ради которого функция и существует: **песочница без
 * включённого подтверждения — это не «онлайн работает», а тупик**, и предлагать
 * её нельзя. Отличать «шлюза нет намеренно» от «шлюз есть, но довести нельзя»
 * важнее, чем перечислить методы.
 *
 * Оплата при получении не зависит от шлюза и доступна всегда — магазин продаёт
 * за наличные и без всякого провайдера.
 */
export function resolveCustomerPaymentMethods(
  provider: 'sandbox' | 'production' | 'none',
  env: PaymentEnvReader,
): CustomerPaymentMethods {
  const online = provider === 'production'
    || (provider === 'sandbox' && env('PAYMENTS_SANDBOX_CONFIRM_ENABLED')?.trim().toLowerCase() === 'true');

  // bakai_pos и obank — эквайринг на прилавке, gift_card идёт отдельным потоком
  // с проверкой кода: покупателю в чекауте витрины они не предлагаются.
  const onlineMethods: PaymentMethod[] = ['card', 'qr_mbank', 'qr_odengi', 'installment'];
  return {
    online,
    methods: online ? ['cash', ...onlineMethods] : ['cash'],
  };
}
