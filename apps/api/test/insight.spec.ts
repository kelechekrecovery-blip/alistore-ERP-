import { buildInsights } from '../src/ai/insight';

/** Keyless rule-based owner insights (Phase 11 AI fallback). */
describe('buildInsights', () => {
  const base = {
    marginPct: 20, grossMargin: 40000, avgCheck: 25000, paidOrders: 4,
    topProduct: null as { name: string; revenue: number } | null,
    topSeller: null as { staffId: string; revenue: number } | null,
    net: 100000, refunds: 0, pendingApprovals: 0,
    risks: [] as { kind: string; severity: string; detail: string }[],
  };

  it('flags low margin as a warning', () => {
    const ins = buildInsights({ ...base, marginPct: 5 });
    const warn = ins.find((i) => i.title.includes('Низкая маржа'));
    expect(warn?.tone).toBe('warning');
  });

  it('celebrates healthy margin and surfaces top product + seller', () => {
    const ins = buildInsights({
      ...base,
      topProduct: { name: 'MacBook', revenue: 189900 },
      topSeller: { staffId: 'ann', revenue: 70000 },
    });
    expect(ins.some((i) => i.title.includes('Здоровая маржа') && i.tone === 'positive')).toBe(true);
    expect(ins.some((i) => i.title.includes('MacBook'))).toBe(true);
    expect(ins.some((i) => i.title.includes('ann') && i.tone === 'positive')).toBe(true);
  });

  it('warns on high-severity risks and pending approvals', () => {
    const ins = buildInsights({
      ...base,
      pendingApprovals: 2,
      risks: [{ kind: 'warranty_sla_breach', severity: 'high', detail: 'Гарантия X просрочила SLA' }],
    });
    expect(ins.some((i) => i.title.includes('критичных тревог'))).toBe(true);
    expect(ins.some((i) => i.title.includes('На одобрении: 2'))).toBe(true);
  });

  it('says all-clear when there are no risks', () => {
    const ins = buildInsights(base);
    expect(ins.some((i) => i.title === 'Всё сходится' && i.tone === 'positive')).toBe(true);
  });

  it('surfaces a restock warning with product names when items are urgent', () => {
    const ins = buildInsights({
      ...base,
      reorderUrgent: { count: 3, names: ['iPhone 15', 'MacBook Pro', 'AirPods'] },
    });
    const warn = ins.find((i) => i.title.includes('Дефицит: 3'));
    expect(warn?.tone).toBe('warning');
    expect(warn?.detail).toContain('iPhone 15');
  });

  it('surfaces an overstock hint pointing at the pricing tab', () => {
    const ins = buildInsights({
      ...base,
      overstock: { count: 2, topName: 'Samsung Galaxy S24' },
    });
    const hint = ins.find((i) => i.title.includes('Затоварка: 2'));
    expect(hint?.tone).toBe('info');
    expect(hint?.detail).toContain('Samsung Galaxy S24');
  });

  it('omits merchandising insights when there is nothing to act on', () => {
    const ins = buildInsights({
      ...base,
      reorderUrgent: { count: 0, names: [] },
      overstock: { count: 0, topName: null },
    });
    expect(ins.some((i) => i.title.includes('Дефицит'))).toBe(false);
    expect(ins.some((i) => i.title.includes('Затоварка'))).toBe(false);
  });
});
