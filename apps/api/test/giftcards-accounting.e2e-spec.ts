import { AuditService } from '../src/audit/audit.service';
import { GiftcardsService } from '../src/giftcards/giftcards.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { clearGiftCardTransactions } from './db-test-cleanup';

/**
 * Выпуск подарочной карты — это выпуск денег.
 *
 * `issue()` создавал `GiftCard` с реальным балансом и не создавал ни одной
 * проводки. Погашение при этом дебетует счёт 2300 «Обязательства по подарочным
 * картам» (`payments.service.ts` `postPaymentEntryOnTx`) — обязательство,
 * которое никогда не кредитовалось. Счёт методично уходил в минус, и это не
 * проверял ни один риск-сигнал.
 *
 * Практический смысл: кассир выпускает карту на 50 000, гасит ею телефон, и в
 * отчётах это выглядит честной выручкой. Товар ушёл, в кассу не пришло ничего.
 *
 * Поэтому здесь проверяется не «создалась ли строка», а бухгалтерский
 * инвариант: обязательство по картам не может быть отрицательным.
 */
describe('Gift card issuance (accounting)', () => {
  let prisma: PrismaService;
  let giftcards: GiftcardsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    giftcards = new GiftcardsService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clearGiftCardTransactions(prisma);
    await prisma.giftCard.deleteMany();
    await prisma.$transaction(async (tx) => {
      // Строки удаляются вместе с проводками: баланс проверяется отложенным
      // триггером на commit, и осиротевшая строка его уронит.
      await tx.accountingJournalLine.deleteMany();
      await tx.accountingJournalEntry.deleteMany();
    });
  });

  const code = () => `GC-ACC-${Date.now().toString(36)}-${(seq += 1)}`;

  it('проводит выпуск карты как обязательство: Дт 1000 / Кт 2300', async () => {
    const amount = 50_000;
    const card = await giftcards.issue({ code: code(), amount }, 'owner-1');

    const entry = await prisma.accountingJournalEntry.findFirst({
      where: { sourceType: 'giftcard.issued', sourceRef: card.id },
      include: { lines: { orderBy: { accountCode: 'asc' } } },
    });

    expect(entry).not.toBeNull();
    expect(entry!.lines).toHaveLength(2);
    expect(entry!.lines.find((line) => line.accountCode === '1000')?.debit).toBe(amount);
    expect(entry!.lines.find((line) => line.accountCode === '2300')?.credit).toBe(amount);
  });

  it('кредит по счёту 2300 равен сумме выпущенных карт', async () => {
    // Первая версия этого теста проходила вхолостую: она гасила карту через
    // redeemOnTx и проверяла, что кредит не меньше дебета. Но дебет 2300 делает
    // не redeemOnTx, а платёжный путь (`postPaymentEntryOnTx`), поэтому дебета
    // в выборке не было вовсе и «0 >= 0» зеленело при полностью отсутствующей
    // проводке. Проверяем то, что действительно нарушено: обязательство должно
    // возникать в момент выпуска и совпадать с выпущенной суммой.
    const amounts = [50_000, 12_500];
    for (const amount of amounts) {
      await giftcards.issue({ code: code(), amount }, 'owner-1');
    }

    const lines = await prisma.accountingJournalLine.findMany({ where: { accountCode: '2300' } });
    const credited = lines.reduce((sum, line) => sum + line.credit - line.debit, 0);

    expect(credited).toBe(amounts.reduce((sum, amount) => sum + amount, 0));
  });

  it('повторный выпуск с тем же ключом идемпотентности не удваивает обязательство', async () => {
    const shared = code();
    const first = await giftcards.issue({ code: shared, amount: 10_000 }, 'owner-1');
    await expect(giftcards.issue({ code: shared, amount: 10_000 }, 'owner-1')).rejects.toThrow();

    const entries = await prisma.accountingJournalEntry.findMany({
      where: { sourceType: 'giftcard.issued', sourceRef: first.id },
    });
    expect(entries).toHaveLength(1);
  });
});
