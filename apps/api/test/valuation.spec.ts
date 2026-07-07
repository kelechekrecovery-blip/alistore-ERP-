import { assessDevice } from '../src/ai/valuation';

/** Keyless used-device valuation (Phase 11): depreciation by age, grade, defects. */
describe('assessDevice', () => {
  it('depreciates a grade-A, near-new device modestly and keeps a buyback margin', () => {
    const v = assessDevice({ basePrice: 100000, grade: 'A', ageMonths: 2, defects: [] });
    // age 1-0.06=0.94 · grade 1.0 · no defects → resale ≈ 94000, buyback 70%
    expect(v.resale).toBe(94000);
    expect(v.buyback).toBe(65800);
    expect(v.buyback).toBeLessThan(v.resale);
    expect(v.retainedPct).toBe(94);
  });

  it('applies grade and defect penalties', () => {
    const a = assessDevice({ basePrice: 100000, grade: 'A', ageMonths: 0, defects: [] });
    const c = assessDevice({ basePrice: 100000, grade: 'C', ageMonths: 0, defects: ['screen', 'battery'] });
    expect(c.resale).toBeLessThan(a.resale);
    expect(c.factors.grade).toBe(0.6);
    expect(c.factors.defect).toBeCloseTo(0.25, 5); // screen .15 + battery .10
  });

  it('floors age depreciation at 20% retained', () => {
    const v = assessDevice({ basePrice: 100000, grade: 'A', ageMonths: 60, defects: [] });
    expect(v.factors.age).toBe(0.2); // 1 - 60*0.03 = -0.8 → floored to 0.2
    expect(v.resale).toBe(20000);
  });

  it('caps total defect penalty at 50% and annotates heavy damage', () => {
    const v = assessDevice({ basePrice: 100000, grade: 'A', ageMonths: 0, defects: ['water', 'screen', 'battery', 'body'] });
    expect(v.factors.defect).toBe(0.5); // .25+.15+.10+.08 = .58 → capped .50
    expect(v.notes.some((n) => n.includes('дефекты'))).toBe(true);
  });
});
