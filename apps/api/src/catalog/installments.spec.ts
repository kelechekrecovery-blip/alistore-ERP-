import { bestInstallmentOffer, installmentOffers, type InstallmentPlan } from './installments';

/**
 * Рассрочка — это цифра, которую покупатель читает как обещание, поэтому она
 * считается на сервере по коммерческим правилам владельца, а не в вёрстке.
 *
 * Провайдеры (Payda/Optima, O!Market/O!Bank, ZERO/А Банк) работают по 0% без
 * наценки для магазина: магазин получает полную сумму сразу. Наценку, если она
 * есть, магазин назначает сам — она живёт в настройках, а не в коде.
 */
const PAYDA: InstallmentPlan = { id: 'payda', label: 'Payda', months: 3, markupBps: 0, limitSom: 100_000 };
const OMARKET: InstallmentPlan = { id: 'omarket', label: 'O!Market', months: 12, markupBps: 0, limitSom: 0 };
const ZERO: InstallmentPlan = { id: 'zero', label: 'ZERO', months: 6, markupBps: 0, limitSom: 200_000 };

describe('installments', () => {
  it('делит цену на срок и округляет платёж вверх', () => {
    // 24 900 / 3 = 8300 ровно.
    expect(bestInstallmentOffer(24_900, [PAYDA])).toEqual({
      id: 'payda',
      label: 'Payda',
      months: 3,
      monthlySom: 8_300,
      totalSom: 24_900,
    });
  });

  it('округляет вверх, чтобы сумма платежей не оказалась меньше цены', () => {
    // 10 000 / 3 = 3333.33 — 3333 × 3 = 9999, магазин недополучил бы сом.
    const offer = bestInstallmentOffer(10_000, [PAYDA]);
    expect(offer?.monthlySom).toBe(3_334);
    expect((offer?.monthlySom ?? 0) * 3).toBeGreaterThanOrEqual(10_000);
  });

  it('применяет наценку магазина в bps к сумме, а не к платежу', () => {
    // 100 000 + 10% = 110 000, срок 12 → 9167 (округление вверх).
    const withMarkup = { ...OMARKET, markupBps: 1_000 };
    const offer = bestInstallmentOffer(100_000, [withMarkup]);
    expect(offer?.totalSom).toBe(110_000);
    expect(offer?.monthlySom).toBe(9_167);
  });

  it('отбрасывает провайдера, чей лимит меньше цены', () => {
    // Payda до 100 000 — телефон за 129 900 в неё не помещается.
    expect(installmentOffers(129_900, [PAYDA]).map((o) => o.id)).toEqual([]);
    expect(installmentOffers(129_900, [PAYDA, ZERO]).map((o) => o.id)).toEqual(['zero']);
  });

  it('лимит 0 означает «без ограничения», а не «ничего нельзя»', () => {
    expect(installmentOffers(1_000_000, [OMARKET]).map((o) => o.id)).toEqual(['omarket']);
  });

  it('срок 0 выключает провайдера', () => {
    expect(installmentOffers(10_000, [{ ...ZERO, months: 0 }])).toEqual([]);
  });

  it('лучшее предложение — с наименьшим ежемесячным платежом', () => {
    // O!Market на 12 месяцев дешевле в месяц, чем Payda на 3.
    expect(bestInstallmentOffer(90_000, [PAYDA, OMARKET])?.id).toBe('omarket');
  });

  it('возвращает null, когда рассрочка недоступна', () => {
    expect(bestInstallmentOffer(0, [PAYDA])).toBeNull();
    expect(bestInstallmentOffer(50_000, [])).toBeNull();
  });

  it('не предлагает рассрочку на цену меньше срока: платёж по нулю не бывает', () => {
    // 2 сома на 3 месяца — это не рассрочка, а бессмыслица.
    expect(bestInstallmentOffer(2, [PAYDA])).toBeNull();
  });
});
