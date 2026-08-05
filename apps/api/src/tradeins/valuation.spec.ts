import { TRADE_IN_GRADES, tradeInEstimate, type TradeInValuation } from './valuation';

const VALUATION: TradeInValuation = {
  tiers: [
    { match: 'iphone 15', baseSom: 65_000 },
    { match: 'iphone 14', baseSom: 52_000 },
    { match: 'macbook', baseSom: 70_000 },
    { match: 'airpods', baseSom: 8_000 },
  ],
  defaultBaseSom: 30_000,
  gradeFactorsBps: { A: 10_000, B: 8_200, C: 6_200 },
  roundToSom: 500,
};

describe('tradeInEstimate', () => {
  it('оценивает по совпадению модели и множителю состояния', () => {
    // 65 000 × 0,82 = 53 300 → к ближайшим 500 → 53 500.
    expect(tradeInEstimate('iPhone 15 Pro 256', 'B', VALUATION)).toBe(53_500);
  });

  it('отличное состояние платит базу без скидки', () => {
    expect(tradeInEstimate('iPhone 15', 'A', VALUATION)).toBe(65_000);
  });

  it('не зависит от регистра и лишних пробелов', () => {
    expect(tradeInEstimate('  MACBOOK Air M2  ', 'A', VALUATION)).toBe(70_000);
  });

  it('берёт первое совпадение — порядок ступеней задаёт владелец', () => {
    // «iPhone 15» стоит выше «iPhone 14», и модель с обеими подстроками
    // (такой в жизни нет, но список редактируют руками) не должна тихо
    // оцениваться по младшей ступени.
    expect(tradeInEstimate('iPhone 15 / 14 trade pack', 'A', VALUATION)).toBe(65_000);
  });

  it('незнакомую модель оценивает по базовой ступени, а не в ноль', () => {
    expect(tradeInEstimate('Xiaomi Redmi Note 13', 'A', VALUATION)).toBe(30_000);
  });

  it('пустая модель не стоит ничего — оценивать нечего', () => {
    expect(tradeInEstimate('   ', 'A', VALUATION)).toBe(0);
  });

  it('нулевая база не превращается в выплату', () => {
    const free: TradeInValuation = { ...VALUATION, defaultBaseSom: 0 };
    expect(tradeInEstimate('неизвестная модель', 'A', free)).toBe(0);
  });

  it('нулевой множитель состояния не превращается в выплату', () => {
    const off: TradeInValuation = { ...VALUATION, gradeFactorsBps: { A: 0, B: 0, C: 0 } };
    expect(tradeInEstimate('iPhone 15', 'A', off)).toBe(0);
  });

  it('отрицательные значения в настройках не дают отрицательную выплату', () => {
    const broken: TradeInValuation = {
      ...VALUATION,
      tiers: [{ match: 'iphone 15', baseSom: -1_000 }],
      gradeFactorsBps: { A: -500, B: -500, C: -500 },
    };
    expect(tradeInEstimate('iPhone 15', 'A', broken)).toBe(0);
  });

  it('шаг округления 0 или меньше не роняет расчёт', () => {
    const raw: TradeInValuation = { ...VALUATION, roundToSom: 0 };
    expect(tradeInEstimate('iPhone 15', 'B', raw)).toBe(53_300);
  });

  it('знает ровно три состояния — больше их взять неоткуда', () => {
    expect(TRADE_IN_GRADES).toEqual(['A', 'B', 'C']);
  });
});
