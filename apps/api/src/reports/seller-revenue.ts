import { Prisma } from '@prisma/client';

/**
 * Кому принадлежит выручка платежа.
 *
 * Два экрана зарплаты отвечали на этот вопрос по-разному и расходились в десять
 * раз. `/reports/payroll` выбирал платежи по `shiftId: { not: null }` и относил
 * их на владельца смены, а `shiftId` пишется **только для наличных**
 * (`payments.service.ts`: card/transfer/giftcard/bonus дают null). Продавец с
 * оборотом 1 000 000, из которых 900 000 картой, получал комиссию со 100 000 —
 * и видел на соседнем экране HR совсем другую сумму.
 *
 * Правильный ответ: продал тот, кто записан в `receivedBy`. Наличные пробиваются
 * в смене кассира, но сделку закрывает продавец. Откат на владельца смены нужен
 * для исторических платежей, у которых `receivedBy` ещё не заполнялся.
 *
 * Модуль держит и выборку, и атрибуцию рядом: разъехались они именно потому, что
 * жили в двух местах.
 */

/** Платежи, участвующие в расчёте выручки продавца, за период и точку. */
export function sellerRevenueWhere(range?: {
  from?: Date;
  to?: Date;
  point?: string;
}): Prisma.PaymentWhereInput {
  const { from, to, point } = range ?? {};
  return {
    amount: { gt: 0 },
    status: { in: ['received', 'reconciled'] },
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
    // У `Payment` есть собственный `point` с индексом `[point, createdAt]`;
    // `shift.point` остаётся для исторических строк, где `point` не заполнялся.
    ...(point ? { OR: [{ point }, { shift: { point } }] } : {}),
  };
}

export interface SellerRevenuePayment {
  amount: number;
  receivedBy: string | null;
  shift: { staffId: string } | null;
}

/** Actor-формат POS-платежа: `receivedBy = "staff:<id>"` (payments.controller). */
const STAFF_ACTOR_PREFIX = 'staff:';

/**
 * Нормализует actor-значение к чистому идентификатору.
 *
 * POS пишет `receivedBy = "staff:<id>"`, а покупательский платёж — сырой
 * `<customerId>`. Оба лежат в одном столбце. Здесь снимается только префикс
 * `staff:`; отличить сотрудника от покупателя по строке нельзя — это делает
 * потребитель, сверяясь с таблицей StaffUser (см. `hr.service`). Возвращать
 * префиксный id наружу нельзя: он не резолвится в StaffUser.id и роняет
 * `HrPayrollLine` FK-violation'ом (F-03).
 */
export function normalizeSellerActor(value: string): string {
  return value.startsWith(STAFF_ACTOR_PREFIX) ? value.slice(STAFF_ACTOR_PREFIX.length) : value;
}

/** Сотрудник, которому принадлежит платёж, или null для исторических строк. */
export function soldBy(payment: SellerRevenuePayment): string | null {
  const raw = payment.receivedBy ?? payment.shift?.staffId ?? null;
  return raw === null ? null : normalizeSellerActor(raw);
}

/** Плоские строки «сотрудник → сумма» для расчёта комиссии. */
export function sellerRevenueRows(
  payments: SellerRevenuePayment[],
): { staffId: string; amount: number }[] {
  return payments
    .map((payment) => ({ staffId: soldBy(payment), amount: payment.amount }))
    .filter((row): row is { staffId: string; amount: number } => row.staffId !== null);
}
