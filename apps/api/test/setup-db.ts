import { PrismaClient } from '@prisma/client';
import { clearGiftCardTransactions } from './db-test-cleanup';
import { ensureReferenceData } from '../src/finance/ensure-reference-data';

const prisma = new PrismaClient();

beforeEach(async () => {
  await clearGiftCardTransactions(prisma);
});

beforeAll(async () => {
  // Тот же установщик, что и у деплоя. Раньше харнесс ставил план счетов своей
  // копией кода — тесты чинили себя сами, и пустой справочник в рабочей базе
  // никто не замечал.
  await ensureReferenceData(prisma);
  await prisma.storePoint.upsert({
    where: { id: 'alistore-bishkek-1' },
    update: { active: true },
    create: {
      id: 'alistore-bishkek-1',
      code: 'center',
      name: 'AliStore Центр',
      address: 'Бишкек, ул. Киевская 95',
      inventoryLocation: 'BISHKEK-1',
      hours: 'Ежедневно 10:00–21:00',
      pickupInstructions: 'Назовите код выдачи сотруднику',
      active: true,
      sortOrder: 10,
      createdBy: 'jest-fixture',
      idempotencyKey: 'jest:store-point:bishkek-1',
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
