import { InsightsService } from '../src/ai/insights.service';

/** Owner insights service wiring: ledger context + merchandising rule engines. */
describe('InsightsService', () => {
  it('feeds pricing and reorder signals into owner insights', async () => {
    const reports = {
      dashboard: jest.fn().mockResolvedValue({
        money: { refunds: 0 },
        ops: { pendingApprovals: 0 },
      }),
      kpi: jest.fn().mockResolvedValue({
        marginPct: 18,
        grossMargin: 42000,
        avgCheck: 21000,
        paidOrders: 2,
        topProducts: [{ name: 'MacBook Air', revenue: 180000 }],
        sellers: [{ staffId: 'seller-1', revenue: 120000 }],
      }),
      risks: jest.fn().mockResolvedValue({ signals: [] }),
    };
    const pricing = {
      review: jest.fn().mockResolvedValue({
        reviews: [
          { action: 'discount', name: 'Samsung Galaxy S24' },
          { action: 'hold', name: 'iPhone 15' },
        ],
      }),
    };
    const reorder = {
      review: jest.fn().mockResolvedValue({
        reviews: [
          { urgency: 'high', name: 'AirPods Pro' },
          { urgency: 'medium', name: 'iPad Air' },
        ],
      }),
    };

    const service = new InsightsService(reports as any, pricing as any, reorder as any);
    const result = await service.insights();

    expect(result.source).toBe('rules');
    expect(pricing.review).toHaveBeenCalledTimes(1);
    expect(reorder.review).toHaveBeenCalledTimes(1);
    expect(result.insights.some((i) => i.title.includes('Дефицит: 1') && i.detail.includes('AirPods Pro'))).toBe(
      true,
    );
    expect(
      result.insights.some((i) => i.title.includes('Затоварка: 1') && i.detail.includes('Samsung Galaxy S24')),
    ).toBe(true);
  });
});
