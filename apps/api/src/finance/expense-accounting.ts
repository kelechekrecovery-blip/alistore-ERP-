import { ExpenseTaxMode } from '@prisma/client';
import { ValidationError } from '../common/errors';

const RATE_SCALE = 1_000_000;
const TAX_SCALE = 10_000;
const DB_INT_MAX = 2_147_483_647;

export type ExpenseAccountingSnapshotInput = {
  documentAmount: number;
  exchangeRateMicros: number;
  taxMode: ExpenseTaxMode;
  taxRateBps: number;
};

export function expenseAccountingSnapshot(input: ExpenseAccountingSnapshotInput) {
  if (!Number.isSafeInteger(input.documentAmount) || input.documentAmount <= 0) {
    throw new ValidationError('expense_document_amount_invalid', 'Сумма документа должна быть положительным целым числом');
  }
  if (!Number.isSafeInteger(input.exchangeRateMicros) || input.exchangeRateMicros <= 0) {
    throw new ValidationError('expense_exchange_rate_invalid', 'Курс должен быть положительным целым числом');
  }
  if (!Number.isSafeInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > TAX_SCALE) {
    throw new ValidationError('expense_tax_rate_invalid', 'Ставка налога должна быть от 0 до 10000 базисных пунктов');
  }
  if (input.taxMode === 'none' && input.taxRateBps !== 0) {
    throw new ValidationError('expense_tax_mode_mismatch', 'Для режима без налога ставка должна быть равна нулю');
  }
  if (input.taxMode !== 'none' && input.taxRateBps === 0) {
    throw new ValidationError('expense_tax_mode_mismatch', 'Для налогового режима требуется положительная ставка');
  }

  const converted = roundedRatio(input.documentAmount, input.exchangeRateMicros, RATE_SCALE);
  let taxBaseAmount = converted;
  let taxAmount = 0;
  let amount = converted;

  if (input.taxMode === 'included') {
    taxAmount = roundedRatio(converted, input.taxRateBps, TAX_SCALE + input.taxRateBps);
    taxBaseAmount = converted - taxAmount;
  } else if (input.taxMode === 'excluded') {
    taxAmount = roundedRatio(converted, input.taxRateBps, TAX_SCALE);
    amount = converted + taxAmount;
  }

  if (taxBaseAmount <= 0 || amount <= 0 || (input.taxMode !== 'none' && taxAmount <= 0)) {
    throw new ValidationError('expense_tax_rounding_invalid', 'Сумма слишком мала для выбранной ставки налога');
  }
  if (![taxBaseAmount, taxAmount, amount].every((value) => Number.isSafeInteger(value) && value <= DB_INT_MAX)) {
    throw new ValidationError('expense_amount_overflow', 'Сумма расхода превышает допустимый диапазон');
  }
  return { amount, taxBaseAmount, taxAmount };
}

function roundedRatio(value: number, numerator: number, denominator: number) {
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const rounded = (product + divisor / 2n) / divisor;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new ValidationError('expense_amount_overflow', 'Сумма расхода превышает допустимый диапазон');
  }
  return result;
}
