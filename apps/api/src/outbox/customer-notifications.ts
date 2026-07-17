import { Prisma } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { OutboxChannel } from './outbox.types';

export interface CustomerNoticeInput {
  customerId: string;
  template: string;
  payload?: Record<string, unknown>;
  channel?: OutboxChannel;
}

/**
 * Enqueue a customer notification only when the customer has opted in. Kept as a
 * small helper so transactional producers stay consistent and consent-filtered.
 */
export async function enqueueConsentedCustomerNotice(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: CustomerNoticeInput,
): Promise<boolean> {
  const customer = await tx.customer.findUnique({
    where: { id: input.customerId },
    select: { phone: true, consent: true },
  });
  if (!customer?.phone || !customer.consent) return false;

  const projection = customerNotificationProjection(input);
  await tx.customerNotification.create({
    data: {
      customerId: input.customerId,
      template: input.template,
      title: projection.title,
      detail: projection.detail,
      symbol: projection.symbol,
      route: projection.route,
      referenceId: projection.referenceId,
    },
  });

  await outbox.enqueueOnTx(tx, {
    channel: input.channel ?? 'sms',
    recipient: input.channel === 'push' ? input.customerId : customer.phone,
    template: input.template,
    payload: { customerId: input.customerId, ...(input.payload ?? {}) },
  });
  return true;
}

function customerNotificationProjection(input: CustomerNoticeInput) {
  const payload = input.payload ?? {};
  const referenceId = stringValue(payload.orderId)
    ?? stringValue(payload.warrantyId)
    ?? stringValue(payload.debtId);

  switch (input.template) {
    case 'order_confirmed':
      return {
        title: 'Заказ принят',
        detail: `Заказ №${shortReference(payload.orderId)} уже собирается`,
        symbol: 'shippingbox.fill',
        route: 'order',
        referenceId,
      };
    case 'order_ready':
      return {
        title: 'Заказ готов',
        detail: `Заказ №${shortReference(payload.orderId)} можно забрать или получить`,
        symbol: 'checkmark.circle.fill',
        route: 'order',
        referenceId,
      };
    case 'warranty_created':
      return {
        title: 'Обращение в сервис создано',
        detail: `Проверяем устройство ${shortReference(payload.imei)}`,
        symbol: 'shield.fill',
        route: 'warranty',
        referenceId,
      };
    case 'warranty_closed':
      return {
        title: 'Гарантийное обращение закрыто',
        detail: `Сервисное обращение по ${shortReference(payload.imei)} завершено`,
        symbol: 'checkmark.shield.fill',
        route: 'warranty',
        referenceId,
      };
    case 'reservation_expired':
      return {
        title: 'Резерв заказа истёк',
        detail: `Откройте заказ №${shortReference(payload.orderId)} и выберите действие`,
        symbol: 'clock.badge.exclamationmark.fill',
        route: 'order',
        referenceId,
      };
    case 'debt_due_soon':
      return {
        title: 'Приближается срок платежа',
        detail: `Остаток к оплате: ${numberValue(payload.balance)} сом`,
        symbol: 'creditcard.fill',
        route: 'account',
        referenceId,
      };
    case 'debt_overdue':
      return {
        title: 'Есть просроченный платёж',
        detail: `Остаток к оплате: ${numberValue(payload.balance)} сом`,
        symbol: 'exclamationmark.triangle.fill',
        route: 'account',
        referenceId,
      };
    default:
      return {
        title: 'Новое уведомление',
        detail: input.template.replaceAll('_', ' '),
        symbol: 'bell.fill',
        route: 'account',
        referenceId,
      };
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function shortReference(value: unknown): string {
  const normalized = stringValue(value);
  return normalized ? normalized.slice(-6) : '—';
}

function numberValue(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString('ru-RU') : '0';
}
