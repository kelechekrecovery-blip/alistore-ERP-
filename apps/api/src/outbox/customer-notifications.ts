import { Prisma } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { OutboxChannel } from './outbox.types';

export interface CustomerNoticeInput {
  customerId: string;
  template: string;
  payload?: Record<string, unknown>;
  channel?: OutboxChannel;
  /**
   * Transactional lifecycle notices (payment/delivery/refund/service status)
   * always reach the customer; marketing consent gates only promo-class traffic.
   */
  transactional?: boolean;
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
  if (!customer?.phone || (!input.transactional && !customer.consent)) return false;

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

export interface StaffNoticeInput {
  template: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

const MANAGER_ROLES = ['owner', 'admin'] as const;

/**
 * Push an operational alert to every active manager (owner/admin), following the
 * courier_run_assigned shape: one push outbox message per staff recipient,
 * enqueued in the same transaction as the domain mutation.
 */
export async function enqueueStaffNotice(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: StaffNoticeInput,
): Promise<number> {
  const recipients = await tx.staffUser.findMany({
    where: { active: true, role: { in: [...MANAGER_ROLES] } },
    select: { id: true },
  });
  for (const recipient of recipients) {
    await outbox.enqueueOnTx(tx, {
      channel: 'push',
      recipient: recipient.id,
      template: input.template,
      payload: { title: input.title, body: input.body, ...(input.payload ?? {}) },
    });
  }
  return recipients.length;
}

function customerNotificationProjection(input: CustomerNoticeInput) {
  const payload = input.payload ?? {};
  const referenceId = stringValue(payload.orderId)
    ?? stringValue(payload.warrantyId)
    ?? stringValue(payload.debtId)
    ?? stringValue(payload.refundId)
    ?? stringValue(payload.returnId)
    ?? stringValue(payload.workOrderId)
    ?? stringValue(payload.loanId)
    ?? stringValue(payload.tradeInId)
    ?? stringValue(payload.ticketId);

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
    case 'payment_received':
      return {
        title: 'Оплата получена',
        detail: `Заказ №${shortReference(payload.orderId)} оплачен на ${numberValue(payload.total)} сом`,
        symbol: 'creditcard.fill',
        route: 'order',
        referenceId,
      };
    case 'order_delivered':
      return {
        title: 'Заказ доставлен',
        detail: `Заказ №${shortReference(payload.orderId)} передан вам курьером`,
        symbol: 'checkmark.circle.fill',
        route: 'order',
        referenceId,
      };
    case 'delivery_failed':
      return {
        title: 'Не удалось доставить заказ',
        detail: `Заказ №${shortReference(payload.orderId)}: ${stringValue(payload.reason) ?? 'доставка не состоялась'}`,
        symbol: 'exclamationmark.triangle.fill',
        route: 'order',
        referenceId,
      };
    case 'order_completed':
      return {
        title: 'Заказ завершён',
        detail: `Заказ №${shortReference(payload.orderId)} закрыт — спасибо за покупку`,
        symbol: 'flag.checkered',
        route: 'order',
        referenceId,
      };
    case 'refund_approved':
      return {
        title: 'Возврат согласован',
        detail: `Возврат ${numberValue(payload.amount)} сом одобрен и передан в исполнение`,
        symbol: 'checkmark.circle.fill',
        route: 'account',
        referenceId,
      };
    case 'refund_succeeded':
      return {
        title: 'Деньги возвращены',
        detail: `Возврат ${numberValue(payload.amount)} сом выполнен`,
        symbol: 'creditcard.fill',
        route: 'account',
        referenceId,
      };
    case 'refund_failed':
      return {
        title: 'Возврат не выполнен',
        detail: `Возврат ${numberValue(payload.amount)} сом требует проверки — свяжитесь с поддержкой`,
        symbol: 'exclamationmark.triangle.fill',
        route: 'account',
        referenceId,
      };
    case 'return_reconciled':
      return {
        title: 'Возврат завершён',
        detail: `Товар по заказу №${shortReference(payload.orderId)} принят на склад`,
        symbol: 'checkmark.circle.fill',
        route: 'order',
        referenceId,
      };
    case 'service_estimate_ready':
      return {
        title: 'Смета ремонта готова',
        detail: `Смета на ${numberValue(payload.estimateAmount)} сом ждёт вашего подтверждения`,
        symbol: 'doc.text.fill',
        route: 'warranty',
        referenceId,
      };
    case 'service_repair_completed':
      return {
        title: 'Ремонт завершён',
        detail: `Устройство ${shortReference(payload.imei)} готово к выдаче`,
        symbol: 'checkmark.shield.fill',
        route: 'warranty',
        referenceId,
      };
    case 'service_loaner_issued':
      return {
        title: 'Подменное устройство выдано',
        detail: `Верните подменное устройство после ремонта`,
        symbol: 'iphone',
        route: 'warranty',
        referenceId,
      };
    case 'exchange_completed':
      return {
        title: 'Обмен завершён',
        detail: `Обмен оформлен, новый заказ №${shortReference(payload.exchangeOrderId)}`,
        symbol: 'arrow.triangle.2.circlepath',
        route: 'order',
        referenceId,
      };
    case 'tradein_decision':
      return {
        title: 'Оценка trade-in готова',
        detail: `${stringValue(payload.model) ?? 'Устройство'}: ${numberValue(payload.price)} сом · договор ${stringValue(payload.contractId) ?? '—'}`,
        symbol: 'tag.fill',
        route: 'account',
        referenceId,
      };
    case 'ticket_resolved':
      return {
        title: 'Ответ поддержки',
        detail: `Обращение «${stringValue(payload.subject) ?? 'без темы'}» решено`,
        symbol: 'bubble.left.fill',
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
