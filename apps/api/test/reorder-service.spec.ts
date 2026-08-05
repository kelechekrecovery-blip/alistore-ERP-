import { ReorderService } from '../src/ai/reorder.service';

describe('ReorderService', () => {
  it('builds a sorted read-only report from product and device-unit facts', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'p-safe', sku: 'SAFE', name: 'Safe stock', category: 'accessories' },
      { id: 'p-out', sku: 'OUT', name: 'Out of stock', category: 'phones' },
    ]);
    const groupBy = jest.fn().mockResolvedValue([
      { productId: 'p-safe', status: 'in_stock', _count: { _all: 8 } },
      { productId: 'p-safe', status: 'sold', _count: { _all: 1 } },
      { productId: 'p-out', status: 'sold', _count: { _all: 4 } },
    ]);
    const service = new ReorderService({ product: { findMany }, deviceUnit: { groupBy } } as any);

    const report = await service.review();

    expect(findMany).toHaveBeenCalledWith({
      where: { archived: false },
      select: { sku: true, name: true, category: true, id: true },
    });
    expect(groupBy).toHaveBeenCalledWith({ by: ['productId', 'status'], _count: { _all: true } });
    expect(report).toMatchObject({ source: 'rules', generatedForCount: 2, needsReorder: 1 });
    expect(report.reviews.map(({ sku }) => sku)).toEqual(['OUT', 'SAFE']);
    expect(report.reviews[0]).toMatchObject({ sku: 'OUT', inStock: 0, soldUnits: 4, urgency: 'high', suggestedQty: 4 });
    expect(report.reviews[1]).toMatchObject({ sku: 'SAFE', inStock: 8, soldUnits: 1, needsReorder: false });
  });
});
