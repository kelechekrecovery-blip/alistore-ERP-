/**
 * Расчёт рассрочки для витрины.
 *
 * Покупатель читает «от 8 300 сом/мес» как обещание магазина, поэтому цифра
 * считается здесь — по коммерческим правилам владельца из настроек, — а не в
 * вёрстке. Ровно этим отличается честный платёж от выдуманного: витрина не
 * имеет права придумать финансовое условие.
 *
 * Партнёрские программы в Кыргызстане (Payda — Оптима Банк, рассрочка O!Market —
 * O!Bank, ZERO — А Банк, M+) работают по 0% и без наценки для магазина: магазин
 * получает полную сумму сразу, проценты и риск берёт банк. Публичного API или
 * виджета для интернет-магазина ни у одной из них нет — рассрочку оформляют
 * вручную в магазине по QR провайдера. Поэтому витрина показывает условие и
 * ведёт покупателя в нужный канал, а не «оформляет рассрочку онлайн».
 * Собственную наценку, если магазин её вводит, задаёт владелец в настройках
 * (`installment.<провайдер>.markup_bps`).
 */

/**
 * Ступени срока, которые предлагают провайдеры: 3, 6 и 12 месяцев.
 *
 * Договоры описываются верхней ступенью — «ZERO: 3/6/12», «M+: 3/6», — поэтому
 * владелец задаёт одно число (`installment.<провайдер>.months`), а доступными
 * становятся все ступени до него включительно. Отдельный список на каждого
 * провайдера в настройках хранить нечем: реестр параметров числовой, а
 * произвольная строка сроков превратилась бы в поле, которое некому проверить.
 */
export const TERM_LADDER = [3, 6, 12] as const;

export interface InstallmentPlan {
  id: string;
  label: string;
  /** Верхняя ступень срока по договору. 0 выключает провайдера. */
  maxMonths: number;
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
    .filter((plan) => plan.maxMonths > 0)
    .filter((plan) => plan.limitSom <= 0 || priceSom <= plan.limitSom)
    .flatMap((plan) => {
      const totalSom = Math.round(priceSom * (1 + Math.max(0, plan.markupBps) / 10_000));
      return TERM_LADDER
        .filter((months) => months <= plan.maxMonths)
        // Ниже числа месяцев рассрочка арифметически невозможна: на 2 сома
        // нельзя сделать три платежа. Настоящий нижний порог («не рассрочиваем
        // дешевле 1000 сом») — коммерческое решение владельца, и его место
        // в настройках, а не здесь: придумывать его тут значит придумывать
        // политику.
        .filter((months) => totalSom >= months)
        .map((months) => ({
          id: plan.id,
          label: plan.label,
          months,
          monthlySom: Math.ceil(totalSom / months),
          totalSom,
        }));
    })
    .filter((offer) => offer.monthlySom > 0 && offer.monthlySom < offer.totalSom)
    .sort((a, b) => a.monthlySom - b.monthlySom || b.months - a.months);
}

export interface InstallmentStep {
  months: number;
  /** Наименьший платёж на этой ступени. */
  monthlySom: number;
  /** Где эту ступень можно оформить, в порядке передачи провайдеров. */
  providers: string[];
}

/**
 * Ступени срока для карточки товара: одна строка на срок, а не на провайдера.
 *
 * Четыре партнёра под 0% дают на трёх месяцах ровно один и тот же платёж, и
 * четыре одинаковые строки — это шум, а не выбор. Покупатель выбирает срок;
 * банк ему важен только тем, где подписывать, поэтому провайдеры перечислены
 * внутри ступени. Если условия расходятся (у кого-то наценка), ступень
 * показывает наименьший платёж — обещать больший, когда есть меньший, нельзя.
 */
export function installmentLadder(
  priceSom: number,
  plans: readonly InstallmentPlan[],
): InstallmentStep[] {
  const byMonths = new Map<number, InstallmentStep>();
  for (const offer of installmentOffers(priceSom, plans)) {
    const step = byMonths.get(offer.months);
    if (!step) {
      byMonths.set(offer.months, { months: offer.months, monthlySom: offer.monthlySom, providers: [offer.label] });
      continue;
    }
    step.providers.push(offer.label);
    step.monthlySom = Math.min(step.monthlySom, offer.monthlySom);
  }
  return [...byMonths.values()].sort((a, b) => a.monthlySom - b.monthlySom || b.months - a.months);
}

/** Предложение с наименьшим ежемесячным платежом — то, что показывает карточка. */
export function bestInstallmentOffer(
  priceSom: number,
  plans: readonly InstallmentPlan[],
): InstallmentOffer | null {
  return installmentOffers(priceSom, plans)[0] ?? null;
}
