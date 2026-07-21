import { AuditService } from '../src/audit/audit.service';
import { GiftcardsService } from '../src/giftcards/giftcards.service';
import { PrismaService } from '../src/prisma/prisma.service';

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

  const PREFIX = 'GC-ACC-';

  /**
   * Чистим только своё.
   *
   * Первая версия делала `giftCard.deleteMany()` и стирала журнал целиком — и
   * уронила соседний спек `giftcards.e2e-spec.ts`, который в том же прогоне
   * держит карты с привязанными платежами (`Payment_giftCardId_fkey`). Тест,
   * затирающий чужие данные, ловит не дефект продукта, а сам себя.
   */
  beforeEach(async () => {
    const mine = await prisma.giftCard.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const ids = mine.map((card) => card.id);
    if (ids.length === 0) return;

    await prisma.$transaction(async (tx) => {
      // Строки и проводки удаляются вместе: баланс проверяется отложенным
      // триггером на commit, и осиротевшая строка его уронит.
      const entries = await tx.accountingJournalEntry.findMany({
        where: { sourceType: 'giftcard.issued', sourceRef: { in: ids } },
        select: { id: true },
      });
      const entryIds = entries.map((entry) => entry.id);
      await tx.accountingJournalLine.deleteMany({ where: { entryId: { in: entryIds } } });
      await tx.accountingJournalEntry.deleteMany({ where: { id: { in: entryIds } } });
    });
    // Карты этого спека не погашаются. Не вызываем общий cleanup: он чистит
    // транзакции карт соседних integration suites в общей test-БД.
    await prisma.giftCard.deleteMany({ where: { id: { in: ids } } });
  });

  const code = () => `${PREFIX}${Date.now().toString(36)}-${(seq += 1)}`;

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
    const issuedIds: string[] = [];
    for (const amount of amounts) {
      const card = await giftcards.issue({ code: code(), amount }, 'owner-1');
      issuedIds.push(card.id);
    }

    const entries = await prisma.accountingJournalEntry.findMany({
      where: { sourceType: 'giftcard.issued', sourceRef: { in: issuedIds } },
      select: { id: true },
    });
    const lines = await prisma.accountingJournalLine.findMany({
      where: { accountCode: '2300', entryId: { in: entries.map((entry) => entry.id) } },
    });
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
