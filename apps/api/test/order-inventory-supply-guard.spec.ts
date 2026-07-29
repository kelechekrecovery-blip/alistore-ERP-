import { assertOrderLineSupplyReceived } from '../src/inventory/order-inventory-sale';

describe('order inventory supply guard', () => {
  const toOrderLine = {
    id: 'item-to-order',
    sku: 'TO-ORDER-SKU',
    supplyModeSnapshot: 'to_order' as const,
  };
  const ownStockLine = {
    id: 'item-own-stock',
    sku: 'OWN-STOCK-SKU',
    supplyModeSnapshot: 'own_stock' as const,
  };

  it('uses the immutable order-line snapshot when the product later changes to own stock', () => {
    expect(() => assertOrderLineSupplyReceived(
      'order-1',
      [toOrderLine],
      new Map(),
    )).toThrow(expect.objectContaining({ code: 'to_order_not_reservable' }));
  });

  it('does not turn a historical own-stock line into supply when the product later changes', () => {
    expect(() => assertOrderLineSupplyReceived(
      'order-2',
      [ownStockLine],
      new Map(),
    )).not.toThrow();
  });

  it.each(['received', 'handed_over'])(
    'allows a to-order line after its customer-scoped supply is %s',
    (status) => {
      expect(() => assertOrderLineSupplyReceived(
        'order-3',
        [toOrderLine],
        new Map([[toOrderLine.id, { status }]]),
      )).not.toThrow();
    },
  );
});
