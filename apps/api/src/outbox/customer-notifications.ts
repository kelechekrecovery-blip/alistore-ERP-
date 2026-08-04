import { createHash } from 'node:crypto';
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
  /** Stable domain event key, for example `deposit:<paymentId>`. */
  dedupKey?: string;
}

export type SupplyCustomerTemplate =
  | 'supply_deposit_received'
  | 'supply_po_sent'
  | 'supply_supplier_confirmed'
  | 'supply_late'
  | 'supply_received'
  | 'supply_ready'
  | 'supply_balance_due'
  | 'supply_cancellation_requested'
  | 'supply_cancellation_owner_review'
  | 'supply_refund_queued'
  | 'supply_refund_completed'
  | 'supply_refund_failed'
  | 'order_no_show_reminder';

export interface SupplyCustomerNoticeInput {
  customerId: string;
  template: SupplyCustomerTemplate;
  eventKey: string;
  payload: {
    orderId: string;
    amount?: number;
    expectedAt?: string;
    reminderDay?: 1 | 3 | 7 | 13;
    refundId?: string;
  };
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
  if (!customer?.phone || (!input.transactional && !customer.consent)) return false;

  const safePayload = redactCustomerNotificationPayload(input.payload ?? {});
  const safeInput = { ...input, payload: safePayload };
  const projection = customerNotificationProjection(safeInput);
  const notificationData = {
      customerId: input.customerId,
      template: input.template,
      title: projection.title,
      detail: projection.detail,
      symbol: projection.symbol,
      route: projection.route,
      referenceId: projection.referenceId,
  };
  if (input.dedupKey) {
    const id = durableCustomerNotificationId(input.customerId, input.template, input.dedupKey);
    await tx.customerNotification.upsert({
      where: { id },
      create: { id, ...notificationData },
      update: {},
    });
  } else {
    await tx.customerNotification.create({ data: notificationData });
  }

  await outbox.enqueueOnTx(tx, {
    ...(input.dedupKey ? { dedupKey: input.dedupKey } : {}),
    channel: input.channel ?? 'sms',
    recipient: input.channel === 'push' ? input.customerId : customer.phone,
    template: input.template,
    payload: { customerId: input.customerId, ...safePayload },
  });
  return true;
}

/** Strict supply lifecycle producer: transactional, redacted and deduplicated. */
export function enqueueSupplyCustomerNotice(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  input: SupplyCustomerNoticeInput,
): Promise<boolean> {
  return enqueueConsentedCustomerNotice(tx, outbox, {
    customerId: input.customerId,
    template: input.template,
    payload: input.payload,
    channel: input.channel,
    transactional: true,
    dedupKey: `supply:${input.template}:${input.eventKey}`,
  });
}

export interface StaffNoticeInput {
  template: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  dedupKey?: string;
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
      ...(input.dedupKey ? { dedupKey: `${input.template}:${input.dedupKey}` } : {}),
      channel: 'push',
      recipient: recipient.id,
      template: input.template,
      payload: { title: input.title, body: input.body, ...(input.payload ?? {}) },
    });
  }
  return recipients.length;
}

export function customerNotificationProjection(input: CustomerNoticeInput) {
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
    case 'order_no_show_reminder':
      return {
        title: 'Заказ ждёт вас',
        detail: `Заказ №${shortReference(payload.orderId)} готов к выдаче`,
        symbol: 'clock.badge.exclamationmark.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_deposit_received':
      return {
        title: 'Задаток получен',
        detail: `По заказу №${shortReference(payload.orderId)} получено ${numberValue(payload.amount)} сом`,
        symbol: 'creditcard.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_po_sent':
      return {
        title: 'Заказ передан поставщику',
        detail: `Товар по заказу №${shortReference(payload.orderId)} заказан у поставщика`,
        symbol: 'shippingbox.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_supplier_confirmed':
      return {
        title: 'Поставщик подтвердил заказ',
        detail: `Ожидаем товар по заказу №${shortReference(payload.orderId)}`,
        symbol: 'checkmark.circle.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_late':
      return {
        title: 'Срок поставки изменился',
        detail: `Заказ №${shortReference(payload.orderId)} задерживается${dateSuffix(payload.expectedAt)}`,
        symbol: 'exclamationmark.triangle.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_received':
      return {
        title: 'Товар поступил',
        detail: `Товар по заказу №${shortReference(payload.orderId)} принят и проходит проверку`,
        symbol: 'shippingbox.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_ready':
      return {
        title: 'Заказ готов',
        detail: `Заказ №${shortReference(payload.orderId)} готов к выдаче`,
        symbol: 'checkmark.circle.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_balance_due':
      return {
        title: 'Остаток к оплате',
        detail: `По заказу №${shortReference(payload.orderId)} осталось оплатить ${numberValue(payload.amount)} сом`,
        symbol: 'creditcard.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_cancellation_requested':
      return {
        title: 'Запрос на отмену принят',
        detail: `Проверяем отмену заказа №${shortReference(payload.orderId)}`,
        symbol: 'clock.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_cancellation_owner_review':
      return {
        title: 'Отмена передана на рассмотрение',
        detail: `По заказу №${shortReference(payload.orderId)} требуется решение владельца`,
        symbol: 'person.crop.circle.badge.questionmark',
        route: 'order',
        referenceId,
      };
    case 'supply_refund_queued':
      return {
        title: 'Возврат поставлен в очередь',
        detail: `Возвращаем ${numberValue(payload.amount)} сом по заказу №${shortReference(payload.orderId)}`,
        symbol: 'arrow.uturn.backward.circle.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_refund_completed':
      return {
        title: 'Деньги возвращены',
        detail: `Возврат ${numberValue(payload.amount)} сом по заказу №${shortReference(payload.orderId)} выполнен`,
        symbol: 'checkmark.circle.fill',
        route: 'order',
        referenceId,
      };
    case 'supply_refund_failed':
      return {
        title: 'Возврат требует проверки',
        detail: `Не удалось вернуть ${numberValue(payload.amount)} сом по заказу №${shortReference(payload.orderId)} — мы проверяем операцию`,
        symbol: 'exclamationmark.triangle.fill',
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

const CUSTOMER_PAYLOAD_DENYLIST = new Set([
  'supplier',
  'supplierid',
  'supplierofferid',
  'suppliersku',
  'cost',
  'unitcost',
  'purchasecost',
  'evidence',
  'ownerreason',
  'requesthash',
  'internalstatus',
]);

/** Defensive recursive copy: internal procurement/approval data never leaves via customer channels. */
export function redactCustomerNotificationPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return redactRecord(payload);
}

function redactRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).flatMap(([key, value]) => {
      if (CUSTOMER_PAYLOAD_DENYLIST.has(key.replaceAll('_', '').toLowerCase())) return [];
      if (Array.isArray(value)) {
        return [[key, value.map((item) => (
          item && typeof item === 'object' && !Array.isArray(item)
            ? redactRecord(item as Record<string, unknown>)
            : item
        ))]];
      }
      if (value && typeof value === 'object') {
        return [[key, redactRecord(value as Record<string, unknown>)]];
      }
      return [[key, value]];
    }),
  );
}

function durableCustomerNotificationId(customerId: string, template: string, dedupKey: string): string {
  const hash = createHash('sha256')
    .update(`${customerId}\u001f${template}\u001f${dedupKey}`)
    .digest('hex');
  return `customer_notice_dedup_${hash}`;
}

function dateSuffix(value: unknown): string {
  const date = stringValue(value);
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.valueOf())) return '';
  return `, новая дата — ${parsed.toLocaleDateString('ru-RU', { timeZone: 'Asia/Bishkek' })}`;
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
