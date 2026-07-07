import { buildInsightMessages, parseInsightsResponse } from '../src/ai/openrouter-provider';
import { InsightContext } from '../src/ai/insight-provider';

const ctx: InsightContext = {
  marginPct: 4,
  grossMargin: 7565,
  avgCheck: 70779,
  paidOrders: 11,
  topProduct: { name: 'MacBook Pro 14" M3', revenue: 569700 },
  topSeller: { staffId: 'pos_azizbek', revenue: 389240 },
  net: 648055,
  refunds: 130510,
  pendingApprovals: 1,
  risks: [{ kind: 'warranty_sla_breach', severity: 'high', detail: 'Гарантия просрочила SLA' }],
  reorderUrgent: { count: 3, names: ['iPhone 15', 'MacBook Pro', 'AirPods'] },
  overstock: { count: 1, topName: 'Samsung Galaxy S24' },
};

describe('buildInsightMessages', () => {
  it('produces a system+user pair with the figures embedded', () => {
    const msgs = buildInsightMessages(ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toContain('MacBook Pro 14');
    expect(msgs[1].content).toContain('Samsung Galaxy S24');
    expect(msgs[0].content).toContain('сом');
  });
});

describe('parseInsightsResponse', () => {
  it('parses a clean JSON array', () => {
    const out = parseInsightsResponse(
      '[{"tone":"warning","title":"Низкая маржа","detail":"Проверьте закупки."}]',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ tone: 'warning', title: 'Низкая маржа', detail: 'Проверьте закупки.' });
  });

  it('extracts the array even when wrapped in prose/markdown', () => {
    const out = parseInsightsResponse(
      'Вот инсайты:\n```json\n[{"tone":"info","title":"Топ","detail":"MacBook лидирует."}]\n```\nГотово.',
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Топ');
  });

  it('coerces unknown tones to info and drops malformed items', () => {
    const out = parseInsightsResponse(
      '[{"tone":"disaster","title":"X","detail":"Y"},{"title":42,"detail":"Z"},{"tone":"positive","title":"OK","detail":"D"}]',
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ tone: 'info', title: 'X', detail: 'Y' });
    expect(out[1].tone).toBe('positive');
  });

  it('throws when there is no JSON array (caller falls back to rules)', () => {
    expect(() => parseInsightsResponse('Извините, не могу.')).toThrow();
  });

  it('throws when the array holds no valid insights', () => {
    expect(() => parseInsightsResponse('[{"foo":"bar"},{}]')).toThrow();
  });
});
