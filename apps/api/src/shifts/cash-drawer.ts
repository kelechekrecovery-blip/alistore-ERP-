import { Prisma } from '@prisma/client';
import { ConflictError, ValidationError } from '../common/errors';

/**
 * Движение наличных в ящике, не проходящее через `Payment`.
 *
 * Ожидаемый остаток смены считался как `openCash + Σ Payment(cash, shiftId)`,
 * поэтому пять каналов двигали реальные деньги мимо сверки: сдача COD курьером,
 * выпуск подарочной карты, выплата комитенту, выкуп trade-in и залог подменного
 * фонда. Смена с продажей карт на 50 000 и выплатой комитенту 90 000 давала
 * недостачу 40 000 на пустом месте — кассиру нечем было её объяснить, а при
 * самозакрытии система же её и оправдывала.
 *
 * Отдельный `Payment` для этих движений создавать нельзя: выручка считается как
 * `Payment + cod.receivable`, и такой платёж удвоил бы её.
 */
export type CashDrawerMovementKind =
  | 'cod_handover'
  | 'giftcard_issue'
  | 'consignment_payout'
  | 'tradein_buyback'
  | 'loaner_deposit';

export interface CashDrawerMovementInput {
  idempotencyKey: string;
  /** Сотрудник, у которого открыта смена и в чей ящик идут деньги. */
  staffId: string;
  /** Больше нуля — приход в ящик, меньше — расход. Ноль запрещён. */
  amount: number;
  kind: CashDrawerMovementKind;
  sourceType?: string;
  sourceRef?: string;
  reason?: string | null;
  createdBy: string;
  accountingEntryId?: string | null;
}

/**
 * Открытая смена сотрудника под `FOR UPDATE`.
 *
 * Тот же контракт, что у наличного платежа (`payments.service.ts`): деньги
 * нельзя положить в ящик, о котором система не знает, и нельзя добавить их в
 * закрытую смену задним числом.
 */
export async function resolveOpenCashShiftOnTx(
  tx: Prisma.TransactionClient,
  staffId: string,
) {
  if (!staffId) {
    throw new ValidationError('cash_staff_required', 'Наличные принимает только авторизованный сотрудник');
  }
  const candidate = await tx.cashShift.findFirst({
    where: { staffId, closedAt: null },
    select: { id: true },
    orderBy: { openedAt: 'desc' },
  });
  if (!candidate) {
    throw new ConflictError('cash_shift_required', 'Для движения наличных нужна открытая кассовая смена');
  }
  await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${candidate.id} FOR UPDATE`;
  const shift = await tx.cashShift.findUnique({ where: { id: candidate.id } });
  if (!shift) throw new ConflictError('cash_shift_required', 'Кассовая смена не найдена');
  if (shift.closedAt) {
    throw new ConflictError('cash_shift_closed', 'Нельзя добавить движение в закрытую кассовую смену');
  }
  return shift;
}

/**
 * Записать движение наличных в смену сотрудника.
 *
 * Идемпотентно по ключу: повтор возвращает существующую строку и не удваивает
 * ожидаемый остаток. Вызывается внутри той же транзакции, что и доменная
 * операция, — иначе деньги и их след разъедутся при откате.
 */
export async function recordCashDrawerMovementOnTx(
  tx: Prisma.TransactionClient,
  input: CashDrawerMovementInput,
) {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) {
    throw new ValidationError('cash_movement_amount_invalid', 'Сумма движения наличных должна быть ненулевым целым');
  }
  const key = input.idempotencyKey.trim();
  if (!key) {
    throw new ValidationError('idempotency_key_required', 'Требуется ключ идемпотентности движения наличных');
  }

  const existing = await tx.cashDrawerMovement.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    // Сверяем содержимое, а не факт наличия ключа: тот же ключ с другой суммой
    // — это ошибка вызывающего, а не повтор.
    if (existing.amount !== input.amount || existing.kind !== input.kind) {
      throw new ConflictError(
        'cash_movement_replay_mismatch',
        'Ключ движения наличных уже использован с другими параметрами',
      );
    }
    return existing;
  }

  const shift = await resolveOpenCashShiftOnTx(tx, input.staffId);
  return tx.cashDrawerMovement.create({
    data: {
      idempotencyKey: key,
      shiftId: shift.id,
      point: shift.point,
      amount: input.amount,
      kind: input.kind,
      sourceType: input.sourceType ?? null,
      sourceRef: input.sourceRef ?? null,
      reason: input.reason ?? null,
      createdBy: input.createdBy,
      accountingEntryId: input.accountingEntryId ?? null,
    },
  });
}
