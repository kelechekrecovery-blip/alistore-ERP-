import type { PrismaClient } from '@prisma/client';
import { ACCOUNTING_ACCOUNT_SEED } from './accounting-chart';

export interface ReferenceDataResult {
  accountsCreated: number;
  accountsTotal: number;
}

/** Часть клиента, которая нужна установщику: так его можно звать и с обычным
 *  PrismaClient, и с транзакционным. */
type ReferenceDataClient = Pick<PrismaClient, 'accountingAccount'>;

/**
 * Ставит справочные данные, без которых система не работает.
 *
 * Идемпотентно и неразрушающе: `skipDuplicates` не трогает уже заведённые счета,
 * поэтому переименование счёта владельцем переживает следующий деплой. Возврат
 * к эталонным названиям — отдельная осознанная операция, а не побочный эффект
 * выкатки.
 *
 * Вызывается из `scripts/deploy-database.mjs` после миграций и из тестового
 * харнесса, чтобы у обоих был один источник и одно поведение.
 */
export async function ensureReferenceData(
  prisma: ReferenceDataClient,
): Promise<ReferenceDataResult> {
  const created = await prisma.accountingAccount.createMany({
    data: ACCOUNTING_ACCOUNT_SEED.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
    })),
    skipDuplicates: true,
  });
  return {
    accountsCreated: created.count,
    accountsTotal: await prisma.accountingAccount.count(),
  };
}
