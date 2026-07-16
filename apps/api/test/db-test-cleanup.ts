import { PrismaClient } from '@prisma/client';

export async function clearGiftCardTransactions(prisma: PrismaClient) {
  const [{ database }] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (!database || !/(^|[_-])test($|[_-])/i.test(database)) {
    throw new Error(`Refusing destructive test cleanup outside an explicit test database: ${database ?? 'unknown'}`);
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "GiftCardTransaction", "RefundLine", "RefundAllocation", "Refund"',
  );
}
