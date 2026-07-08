import { PriceScoutService } from '../src/ai/price-scout.service';
import {
  buildPriceScoutMessages,
  parsePriceScoutResponse,
  scoutPriceByRules,
} from '../src/ai/price-scout';

describe('scoutPriceByRules', () => {
  it('uses manual market listings and keeps the recommendation inside the market corridor', () => {
    const result = scoutPriceByRules({
      name: 'iPhone 15 128GB',
      category: 'phones',
      basePrice: 110000,
      observedListings: [
        { price: 94000, source: 'lalafo' },
        { price: 99000, source: 'telegram' },
        { price: 101000, source: 'store' },
        { price: 106000, source: 'classified' },
        { price: 450000, source: 'outlier' },
      ],
    });
    expect(result.source).toBe('rules');
    expect(result.marketLow).toBeGreaterThanOrEqual(94000);
    expect(result.marketHigh).toBeLessThan(450000);
    expect(result.recommendedPrice).toBeGreaterThanOrEqual(result.marketLow);
    expect(result.recommendedPrice).toBeLessThanOrEqual(result.marketHigh);
    expect(result.signals).toContain('manual_listings:4');
    expect(result.confidence).toBeGreaterThanOrEqual(0.68);
  });

  it('falls back to catalog anchor when no listings are supplied', () => {
    const result = scoutPriceByRules({ name: 'MacBook Air', basePrice: 140000, observedListings: [] });
    expect(result.signals).toContain('no_external_listings');
    expect(result.confidence).toBe(0.42);
    expect(result.recommendedPrice).toBe(126200);
  });
});

describe('price scout OpenRouter helpers and service', () => {
  it('builds a strict prompt and parses a provider response', () => {
    const messages = buildPriceScoutMessages({ name: 'iPhone', basePrice: 100000 });
    expect(messages[0].content).toContain('JSON-объект');
    expect(messages[1].content).toContain('100000');

    const parsed = parsePriceScoutResponse(
      '{"marketLow":90000,"marketMedian":100000,"marketHigh":110000,"recommendedPrice":98000,"confidence":0.7,"signals":["x"],"notes":["n"]}',
    );
    expect(parsed).toEqual({
      marketLow: 90000,
      marketMedian: 100000,
      marketHigh: 110000,
      recommendedPrice: 98000,
      confidence: 0.7,
      signals: ['x'],
      notes: ['n'],
    });
  });

  it('resolves SKU from catalog and falls back when provider fails', async () => {
    const oldKey = process.env.AI_PROVIDER_KEY;
    const oldFetch = global.fetch;
    process.env.AI_PROVIDER_KEY = 'test-key';
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          sku: 'IPHONE-15',
          name: 'iPhone 15',
          category: 'phones',
          price: 109900,
        }),
      },
    };
    try {
      const result = await new PriceScoutService(prisma as any).scout({ sku: 'IPHONE-15' });
      expect(prisma.product.findUnique).toHaveBeenCalledWith({ where: { sku: 'IPHONE-15' } });
      expect(result.source).toBe('rules (fallback)');
      expect(result.signals).toContain('catalog_anchor:109900');
    } finally {
      if (oldKey === undefined) delete process.env.AI_PROVIDER_KEY;
      else process.env.AI_PROVIDER_KEY = oldKey;
      global.fetch = oldFetch;
    }
  });
});
