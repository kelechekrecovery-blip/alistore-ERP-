/**
 * Расчёт рассрочки для витрины.
 *
 * Покупатель читает «от 8 300 сом/мес» как обещание магазина, поэтому цифра
 * считается здесь — по коммерческим правилам владельца из настроек, — а не в
 * вёрстке. Ровно этим отличается честный платёж от выдуманного: витрина не
 * имеет права придумать финансовое условие.
 *
 * Партнёрские программы в Кыргызстане (Payda — Оптима Банк, рассрочка O!Market —
 * O!Bank, ZERO — А Банк) работают по 0% и без наценки для магазина: магазин
 * получает полную сумму сразу, проценты и риск берёт банк. Публичного API или
 * виджета для интернет-магазина ни у одной из них нет — поэтому витрина
 * показывает условие и ведёт покупателя в нужный канал, а не «оформляет
 * рассрочку онлайн». Собственную наценку, если магазин её вводит, задаёт
 * владелец в настройках (`installment.<провайдер>.markup_bps`).
 */

export interface InstallmentPlan {
  id: string;
  label: string;
  /** Срок в месяцах. 0 выключает провайдера. */
  months: number;
  /** Наценка магазина в базисных пунктах: 1000 bps = 10%. Обычно 0. */
  markupBps: number;
  /** Потолок суммы. 0 — без ограничения. */
  limitSom: number;
}

export interface InstallmentOffer {
  id: string;
  label: string;
  months: number;
  /** Ежемесячный платёж, сом. */
  monthlySom: number;
  /** Итого к выплате, сом: цена плюс наценка магазина. */
  totalSom: number;
}

/**
 * Все доступные для этой цены предложения, от меньшего платежа к большему.
 *
 * Платёж округляется **вверх**: при делении 10 000 на 3 честные 3 333 сома
 * в сумме дают 9 999 — магазин недополучил бы сом на каждой продаже.
 */
export function installmentOffers(priceSom: number, plans: readonly InstallmentPlan[]): InstallmentOffer[] {
  if (!Number.isFinite(priceSom) || priceSom <= 0) return [];
  return plans
    .filter((plan) => plan.months > 0)
    .filter((plan) => plan.limitSom <= 0 || priceSom <= plan.limitSom)
    // Ниже числа месяцев рассрочка арифметически невозможна: на 2 сома нельзя
    // сделать три платежа. Настоящий нижний порог («не рассрочиваем дешевле
    // 1000 сом») — коммерческое решение владельца, и его место в настройках,
    // а не в этой функции: придумывать его здесь значит придумывать политику.
    .filter((plan) => priceSom >= plan.months)
    .map((plan) => {
      const totalSom = Math.round(priceSom * (1 + Math.max(0, plan.markupBps) / 10_000));
      return {
        id: plan.id,
        label: plan.label,
        months: plan.months,
        monthlySom: Math.ceil(totalSom / plan.months),
        totalSom,
      };
    })
    // Платёж в ноль сомов рассрочкой не является: цена меньше числа месяцев.
    .filter((offer) => offer.monthlySom > 0 && offer.monthlySom < offer.totalSom)
    .sort((a, b) => a.monthlySom - b.monthlySom || a.months - b.months);
}

/** Предложение с наименьшим ежемесячным платежом — то, что показывает карточка. */
export function bestInstallmentOffer(
  priceSom: number,
  plans: readonly InstallmentPlan[],
): InstallmentOffer | null {
  return installmentOffers(priceSom, plans)[0] ?? null;
}
