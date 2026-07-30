import type { CatalogProduct } from './api/catalog';
import type { CustomerOrderItem, OrderReceivableView } from './api/orders';

type AvailabilityKind = CatalogProduct['availabilityKind'];

export interface CatalogAvailabilityPresentation {
  kind: AvailabilityKind;
  buyable: boolean;
  isInStock: boolean;
  isToOrder: boolean;
  leadTimeDays: number | null;
  estimatedDeliveryDate: string | null;
}

/**
 * The public availability fields are the storefront contract. The fallback
 * keeps previously cached own-stock carts/cards working while an older API
 * response is being replaced, but never makes an unavailable item buyable.
 */
export function catalogAvailability(
  product: CatalogProduct,
): CatalogAvailabilityPresentation {
  const kind: AvailabilityKind =
    product.availabilityKind === 'in_stock'
    || product.availabilityKind === 'to_order'
    || product.availabilityKind === 'unavailable'
      ? product.availabilityKind
      : product.availableUnits > 0
        ? 'in_stock'
        : product.supplyMode === 'to_order'
          ? 'to_order'
          : 'unavailable';
  const isInStock = kind === 'in_stock';
  const isToOrder = kind === 'to_order';

  return {
    kind,
    buyable: product.orderable && (isInStock || isToOrder),
    isInStock,
    isToOrder,
    leadTimeDays: isToOrder
      ? validPositiveInteger(product.leadTimeDays) ?? validPositiveInteger(product.supplyLeadDays)
      : null,
    estimatedDeliveryDate: isToOrder && isValidDate(product.estimatedDeliveryDate)
      ? product.estimatedDeliveryDate
      : null,
  };
}

export function availabilityLabel(
  availability: CatalogAvailabilityPresentation,
  availableUnits: number,
): string {
  if (availability.isInStock) return `В наличии · ${availableUnits} шт.`;
  if (!availability.isToOrder) return 'Нет в наличии';

  const parts = ['Под заказ'];
  if (availability.leadTimeDays) {
    parts.push(`${availability.leadTimeDays} ${daysWord(availability.leadTimeDays)}`);
  }
  if (availability.estimatedDeliveryDate) {
    parts.push(`ориентировочно ${formatDate(availability.estimatedDeliveryDate)}`);
  }
  return parts.join(' · ');
}

export interface PaymentScheduleSummary {
  valid: boolean;
  blockingReasons: string[];
  depositNow: number;
  stockAtReceipt: number;
  toOrderBalance: number;
  delivery: number;
}

/**
 * A mixed-order schedule is safe to display only when every expected bucket is
 * present and the schedule reconciles to the server total. Missing finance
 * fields must block payment guidance instead of being rendered as zero.
 */
export function summarizePaymentSchedule(input: {
  schedule?: OrderReceivableView[];
  items?: CustomerOrderItem[];
  total: number;
  deliveryFee?: number;
  initialDue?: number;
  expectsToOrder?: boolean;
  expectsOwnStock?: boolean;
}): PaymentScheduleSummary {
  const schedule = input.schedule ?? [];
  const reasons: string[] = [];
  const hasToOrder = input.expectsToOrder
    ?? input.items?.some((item) => item.supplyModeSnapshot === 'to_order')
    ?? false;
  const hasOwnStock = input.expectsOwnStock
    ?? input.items?.some((item) => item.supplyModeSnapshot !== 'to_order')
    ?? false;

  if (schedule.length === 0) reasons.push('Сервер не вернул график начислений.');
  if (schedule.some((row) => !Number.isFinite(row.amount) || row.amount < 0)) {
    reasons.push('В графике есть некорректная сумма.');
  }
  const sum = (kind: OrderReceivableView['kind']) =>
    schedule
      .filter((row) => row.kind === kind)
      .reduce((total, row) => total + row.amount, 0);
  const hasKind = (kind: OrderReceivableView['kind']) =>
    schedule.some((row) => row.kind === kind);

  const depositNow = sum('supply_deposit');
  const stockAtReceipt = sum('stock_sale');
  const toOrderBalance = sum('supply_balance');
  const delivery = sum('delivery');

  if (hasToOrder && !hasKind('supply_deposit')) reasons.push('Не указана сумма задатка.');
  if (hasToOrder && !hasKind('supply_balance')) reasons.push('Не указан остаток заказных товаров.');
  if (hasOwnStock && !hasKind('stock_sale')) reasons.push('Не указана сумма складских товаров.');
  if ((input.deliveryFee ?? 0) > 0 && !hasKind('delivery')) reasons.push('Не указана стоимость доставки.');

  const scheduledTotal = depositNow + stockAtReceipt + toOrderBalance + delivery;
  if (Number.isFinite(input.total) && scheduledTotal !== input.total) {
    reasons.push('График начислений не сходится с итогом заказа.');
  }
  if (input.initialDue !== undefined && input.initialDue !== depositNow) {
    reasons.push('Сумма к внесению не совпадает с графиком.');
  }

  return {
    valid: reasons.length === 0,
    blockingReasons: reasons,
    depositNow,
    stockAtReceipt,
    toOrderBalance,
    delivery,
  };
}

export interface OrderLineTimelineStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'future' | 'failed';
}

const TO_ORDER_STEPS = [
  ['awaiting_deposit', 'Задаток'],
  ['procurement_draft', 'Закупка'],
  ['supplier_ordered', 'Заказан поставщику'],
  ['in_transit', 'В пути'],
  ['received', 'Поступил'],
  ['quality_check', 'Проверка'],
  ['ready', 'Готов'],
  ['handed_over', 'Выдан'],
] as const;

const OWN_STOCK_STEPS = [
  ['pending_payment', 'Оплата'],
  ['reserved', 'Резерв'],
  ['ready', 'Готов'],
  ['handed_over', 'Выдан'],
] as const;

const LINE_EXCEPTION_LABELS: Record<string, string> = {
  late: 'Поставка задерживается',
  supplier_rejected: 'Поставщик отказал',
  customer_cancelled: 'Отменён покупателем',
  quarantined: 'Товар на проверке',
  cancelled: 'Строка отменена',
  reservation_expired: 'Резерв истёк',
};

export function buildOrderLineTimeline(item: CustomerOrderItem): OrderLineTimelineStep[] {
  const steps = item.supplyModeSnapshot === 'to_order' ? TO_ORDER_STEPS : OWN_STOCK_STEPS;
  const current = item.orderLineSupply?.status ?? item.fulfillmentStatus ?? steps[0][0];
  const currentIndex = steps.findIndex(([key]) => key === current);
  const exceptionLabel = LINE_EXCEPTION_LABELS[current];

  const normalSteps: OrderLineTimelineStep[] = steps.map(([key, label], index) => ({
    key,
    label,
    state: exceptionLabel
      ? 'future'
      : currentIndex < 0
        ? index === 0 ? 'current' : 'future'
        : index < currentIndex
          ? 'done'
          : index === currentIndex
            ? 'current'
            : 'future',
  }));
  return exceptionLabel
    ? [...normalSteps, { key: current, label: exceptionLabel, state: 'failed' }]
    : normalSteps;
}

function validPositiveInteger(value: number | null | undefined): number | null {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : null;
}

function isValidDate(value: string | null | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Bishkek',
  });
}

function daysWord(value: number): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}
