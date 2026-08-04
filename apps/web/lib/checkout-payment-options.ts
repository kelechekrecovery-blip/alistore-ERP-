/** Способы оплаты, которые чекаут показывает покупателю. */
export type CheckoutPaymentId = 'cash' | 'card' | 'qr_mbank' | 'qr_odengi' | 'installment';

const ORDER: CheckoutPaymentId[] = ['cash', 'card', 'qr_mbank', 'qr_odengi', 'installment'];

export interface CheckoutPaymentOptions {
  options: CheckoutPaymentId[];
  /** Оплатить нечем: сервер не даёт онлайн, а способ доставки запрещает наличные. */
  blocked: boolean;
  notice: string | null;
}

/**
 * Какие способы оплаты показать — по ответу сервера, а не по константе.
 *
 * Список был захардкожен во фронте, и покупатель видел «Картой» там, где сервер
 * не мог довести оплату до конца: песочный провайдер создавал intent, а
 * подтверждение было выключено, поэтому заказ навсегда оставался в
 * `awaiting_payment`. Показывать способ, который не доводит до оплаты, — то же
 * самое, что обещать несуществующую услугу.
 *
 * Отдельный край: экспресс-доставка запрещает оплату при получении. Если при
 * этом нет и онлайна, платить нечем вообще — тогда честнее сказать это и увести
 * на другой способ доставки, чем показать пустой список кнопок.
 */
export function resolveCheckoutPaymentOptions(input: {
  /** Что назвал сервер; `null` — ответа не было (не выдумываем). */
  serverMethods: string[] | null;
  online: boolean;
  cashAllowed: boolean;
}): CheckoutPaymentOptions {
  const allowed = new Set(input.serverMethods ?? ['cash']);
  const options = ORDER.filter((id) => allowed.has(id))
    .filter((id) => id !== 'cash' || input.cashAllowed);

  if (options.length === 0) {
    return {
      options,
      blocked: true,
      notice: 'Экспресс-доставку сейчас нельзя оплатить: онлайн-оплата недоступна, '
        + 'а при получении экспресс не оплачивается. Выберите курьера или самовывоз.',
    };
  }
  if (!input.online) {
    return { options, blocked: false, notice: 'Онлайн-оплата временно недоступна — заказ оплачивается при получении.' };
  }
  return { options, blocked: false, notice: null };
}
