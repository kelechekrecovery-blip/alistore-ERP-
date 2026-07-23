import { PrismaClient } from '@prisma/client';
import { ACCOUNTING_ACCOUNT_SEED } from '../src/finance/accounting-chart';
import { ensureReferenceData } from '../src/finance/ensure-reference-data';

/**
 * Справочные данные должны ставиться самим деплоем, а не тестовым харнессом.
 *
 * До этого план счетов жил в двух местах — INSERT внутри миграции
 * `20260716050000` и `createMany` в `test/setup-db.ts`. Тесты чинили себя сами,
 * поэтому пустой план счетов в рабочей базе никто не замечал: отказ вылезал за
 * три шага от причины — приёмка товара падала с «Счёт 1200 не найден».
 */
describe('Reference data: chart of accounts', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    // Возвращаем полный набор: другие сьюты в этом же процессе рассчитывают на него.
    await ensureReferenceData(prisma);
    await prisma.$disconnect();
  });

  it('устанавливает полный план счетов на базе, где его нет', async () => {
    // Журнальные строки ссылаются на счета внешним ключом, поэтому удаляем
    // только те, что заведомо не заняты проводками этого прогона.
    const untouched = await prisma.accountingAccount.findMany({
      where: { code: { in: ['6700', '6900', '6990'] } },
      select: { code: true },
    });
    await prisma.accountingAccount.deleteMany({
      where: { code: { in: untouched.map((account) => account.code) } },
    });

    const installed = await ensureReferenceData(prisma);

    expect(installed.accountsCreated).toBeGreaterThanOrEqual(untouched.length);
    const codes = await prisma.accountingAccount.findMany({ select: { code: true } });
    const present = new Set(codes.map((account) => account.code));
    for (const account of ACCOUNTING_ACCOUNT_SEED) {
      expect(present.has(account.code)).toBe(true);
    }
  });

  it('повторный запуск ничего не дублирует и не переписывает', async () => {
    await ensureReferenceData(prisma);
    const before = await prisma.accountingAccount.count();

    const second = await ensureReferenceData(prisma);

    expect(second.accountsCreated).toBe(0);
    expect(await prisma.accountingAccount.count()).toBe(before);
  });

  it('в наборе нет дублей кодов — иначе установщик молча потеряет счёт', () => {
    const codes = ACCOUNTING_ACCOUNT_SEED.map((account) => account.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
