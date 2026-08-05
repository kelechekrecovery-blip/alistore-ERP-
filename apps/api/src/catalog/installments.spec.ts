import {
  bestInstallmentOffer,
  installmentLadder,
  installmentOffers,
  TERM_LADDER,
  type InstallmentPlan,
} from './installments';

/**
 * Рассрочка — это цифра, которую покупатель читает как обещание, поэтому она
 * считается на сервере по коммерческим правилам владельца, а не в вёрстке.
 *
 * У провайдеров не один срок, а лестница: ZERO даёт 3/6/12 месяцев, M+ — 3/6.
 * Владелец задаёт одним числом верхнюю ступень своего договора, а доступными
 * становятся все ступени до неё включительно.
 */
const PAYDA: InstallmentPlan = { id: 'payda', label: 'Payda', maxMonths: 3, markupBps: 0, limitSom: 100_000 };
const OMARKET: InstallmentPlan = { id: 'omarket', label: 'O!Market', maxMonths: 12, markupBps: 0, limitSom: 0 };
const ZERO: InstallmentPlan = { id: 'zero', label: 'ZERO', maxMonths: 12, markupBps: 0, limitSom: 200_000 };
const MPLUS: InstallmentPlan = { id: 'mplus', label: 'M+', maxMonths: 6, markupBps: 0, limitSom: 0 };

describe('installments', () => {
  it('лестница сроков — 3, 6 и 12 месяцев', () => {
    expect(TERM_LADDER).toEqual([3, 6, 12]);
  });

  it('раскрывает провайдера во все ступени до его потолка', () => {
    // ZERO по договору 3/6/12.
    expect(installmentOffers(60_000, [ZERO]).map((o) => o.months).sort((a, b) => a - b)).toEqual([3, 6, 12]);
    // M+ по договору 3/6 — двенадцати у него нет.
    expect(installmentOffers(60_000, [MPLUS]).map((o) => o.months).sort((a, b) => a - b)).toEqual([3, 6]);
    // Payda с потолком 3 — одна ступень.
    expect(installmentOffers(60_000, [PAYDA]).map((o) => o.months)).toEqual([3]);
  });

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
    expect(offer?.months).toBe(12);
    expect(offer?.monthlySom).toBe(9_167);
  });

  it('отбрасывает провайдера, чей лимит меньше цены', () => {
    // Payda до 100 000 — телефон за 129 900 в неё не помещается.
    expect(installmentOffers(129_900, [PAYDA])).toEqual([]);
    expect(installmentOffers(129_900, [PAYDA, ZERO]).every((o) => o.id === 'zero')).toBe(true);
  });

  it('лимит 0 означает «без ограничения», а не «ничего нельзя»', () => {
    expect(installmentOffers(1_000_000, [OMARKET]).length).toBeGreaterThan(0);
  });

  it('потолок 0 выключает провайдера', () => {
    expect(installmentOffers(10_000, [{ ...ZERO, maxMonths: 0 }])).toEqual([]);
  });

  it('лучшее предложение — с наименьшим ежемесячным платежом', () => {
    // Самый длинный доступный срок даёт наименьший платёж.
    const best = bestInstallmentOffer(90_000, [PAYDA, OMARKET]);
    expect(best?.id).toBe('omarket');
    expect(best?.months).toBe(12);
    expect(best?.monthlySom).toBe(7_500);
  });

  it('возвращает null, когда рассрочка недоступна', () => {
    expect(bestInstallmentOffer(0, [PAYDA])).toBeNull();
    expect(bestInstallmentOffer(50_000, [])).toBeNull();
  });

  it('не предлагает ступень, на которой платёж вырождается', () => {
    // 4 сома: на 3 месяца ещё можно, на 6 и 12 — уже нет.
    expect(installmentOffers(4, [ZERO]).map((o) => o.months)).toEqual([3]);
    expect(bestInstallmentOffer(2, [PAYDA])).toBeNull();
  });

  describe('installmentLadder', () => {
    it('схлопывает одинаковые сроки в одну ступень и перечисляет, где оформить', () => {
      // Четыре провайдера дают 3 месяца по одной цене: покупателю это одна
      // ступень, а не четыре строки. Он выбирает срок, а не банк.
      const ladder = installmentLadder(24_900, [PAYDA, OMARKET, ZERO, MPLUS]);
      expect(ladder.map((step) => step.months)).toEqual([12, 6, 3]);
      expect(ladder[2]).toEqual({
        months: 3,
        monthlySom: 8_300,
        providers: ['Payda', 'O!Market', 'ZERO', 'M+'],
      });
    });

    it('на ступени показывает наименьший платёж, если провайдеры расходятся', () => {
      // У ZERO наценка 10% — на той же ступени он дороже, и ступень должна
      // показать дешёвый платёж, а не первый попавшийся.
      const pricier = { ...ZERO, markupBps: 1_000 };
      const [step] = installmentLadder(120_000, [OMARKET, pricier]);
      expect(step.months).toBe(12);
      expect(step.monthlySom).toBe(10_000);
      expect(step.providers).toEqual(['O!Market', 'ZERO']);
    });

    it('пустая лестница, когда рассрочка недоступна', () => {
      expect(installmentLadder(129_900, [PAYDA])).toEqual([]);
    });
  });
});
