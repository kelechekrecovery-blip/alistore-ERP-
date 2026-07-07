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
});
