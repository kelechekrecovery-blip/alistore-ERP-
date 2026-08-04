import { describe, expect, it } from 'vitest';
import type { CatalogProduct } from './api/catalog';
import type { CustomerOrderItem, OrderReceivableView } from './api/orders';
import {
  availabilityLabel,
  buildOrderLineTimeline,
  catalogAvailability,
  summarizePaymentSchedule,
} from './to-order';

const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: 'product-1',
  sku: 'SKU-1',
  name: 'Телефон',
  price: 100_000,
  category: 'phones',
  supplyMode: 'own_stock',
  supplyLeadDays: null,
  orderable: true,
  availabilityKind: 'in_stock',
  leadTimeDays: null,
  estimatedDeliveryDate: null,
  attrs: null,
  availableUnits: 2,
  reviewCount: 0,
  avgRating: null,
  ...overrides,
});

const line = (overrides: Partial<CustomerOrderItem>): CustomerOrderItem => ({
  id: 'line-1',
  sku: 'SKU-1',
  qty: 1,
  price: 100_000,
  ...overrides,
});

const receivable = (
  kind: OrderReceivableView['kind'],
  amount: number,
): OrderReceivableView => ({
  id: kind,
  orderItemId: null,
  kind,
  amount,
  settledAmount: 0,
  status: 'open',
});

describe('catalogAvailability', () => {
  it('shows the public lead time and ETA while the feature flag disables purchase', () => {
    const value = catalogAvailability(product({
      supplyMode: 'to_order',
      availabilityKind: 'to_order',
      orderable: false,
      availableUnits: 0,
      supplyLeadDays: 9,
      leadTimeDays: 7,
      estimatedDeliveryDate: '2026-08-06T00:00:00.000Z',
    }));

    expect(value.buyable).toBe(false);
    expect(availabilityLabel(value, 0)).toContain('Под заказ · 7 дней');
    expect(availabilityLabel(value, 0)).toContain('ориентировочно');
  });

  it('preserves own-stock availability', () => {
    const value = catalogAvailability(product());
    expect(value).toMatchObject({ isInStock: true, isToOrder: false, buyable: true });
    expect(availabilityLabel(value, 2)).toBe('В наличии · 2 шт.');
  });
});

describe('summarizePaymentSchedule', () => {
  const items = [
    line({ id: 'stock', supplyModeSnapshot: 'own_stock', price: 60_000 }),
    line({ id: 'supply', supplyModeSnapshot: 'to_order', price: 40_000 }),
  ];

  it('separates all four mixed-order buckets', () => {
    const result = summarizePaymentSchedule({
      items,
      total: 101_000,
      deliveryFee: 1_000,
      initialDue: 8_000,
      schedule: [
        receivable('supply_deposit', 8_000),
        receivable('stock_sale', 60_000),
        receivable('supply_balance', 32_000),
        receivable('delivery', 1_000),
      ],
    });

    expect(result).toEqual({
      valid: true,
      blockingReasons: [],
      depositNow: 8_000,
      stockAtReceipt: 60_000,
      toOrderBalance: 32_000,
      delivery: 1_000,
    });
  });

  it('fails closed when a financial bucket is missing or totals do not reconcile', () => {
    const result = summarizePaymentSchedule({
      items,
      total: 101_000,
      deliveryFee: 1_000,
      schedule: [receivable('supply_deposit', 8_000)],
    });

    expect(result.valid).toBe(false);
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'Не указан остаток заказных товаров.',
      'Не указана сумма складских товаров.',
      'Не указана стоимость доставки.',
      'График начислений не сходится с итогом заказа.',
    ]));
  });
});

describe('buildOrderLineTimeline', () => {
  it('builds a line-level supplier journey', () => {
    const steps = buildOrderLineTimeline(line({
      supplyModeSnapshot: 'to_order',
      fulfillmentStatus: 'in_transit',
      orderLineSupply: {
        status: 'in_transit',
        orderedQty: 1,
        receivedQty: 0,
      },
    }));

    expect(steps.find((step) => step.key === 'supplier_ordered')?.state).toBe('done');
    expect(steps.find((step) => step.key === 'in_transit')?.state).toBe('current');
    expect(steps.find((step) => step.key === 'received')?.state).toBe('future');
  });

  it.each([
    ['late', 'Поставка задерживается'],
    ['supplier_rejected', 'Поставщик отказал'],
    ['customer_cancelled', 'Отменён покупателем'],
    ['quarantined', 'Товар на проверке'],
    ['cancelled', 'Строка отменена'],
    ['reservation_expired', 'Резерв истёк'],
  ])('renders %s as an explicit exception step', (status, label) => {
    const steps = buildOrderLineTimeline(line({
      supplyModeSnapshot: status === 'reservation_expired' ? 'own_stock' : 'to_order',
      fulfillmentStatus: status,
    }));

    expect(steps.at(-1)).toEqual({ key: status, label, state: 'failed' });
    expect(steps[0].state).toBe('future');
    expect(steps[0].state).not.toBe('failed');
  });
});
