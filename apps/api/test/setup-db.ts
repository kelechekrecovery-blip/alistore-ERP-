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

  // Дополнительные точки для мультиточечных сьютов (service-center, service-loaner,
  // staff-auth-guard моделируют вторую/третью точку). `StaffUser.point` — внешний
  // ключ на `StorePoint.inventoryLocation`, поэтому эти точки обязаны существовать
  // до создания сотрудника, привязанного к ним. Свободными строками, как раньше,
  // они быть перестали.
  for (const point of [
    { id: 'jest-bishkek-2', code: 'jest-bishkek-2', inventoryLocation: 'BISHKEK-2', name: 'AliStore Восток' },
    { id: 'jest-osh-1', code: 'jest-osh-1', inventoryLocation: 'OSH-1', name: 'AliStore Ош' },
  ]) {
    await prisma.storePoint.upsert({
      where: { id: point.id },
      update: { active: true },
      create: {
        id: point.id,
        code: point.code,
        name: point.name,
        address: '—',
        inventoryLocation: point.inventoryLocation,
        hours: 'Ежедневно 10:00–21:00',
        active: true,
        sortOrder: 20,
        createdBy: 'jest-fixture',
        idempotencyKey: `jest:store-point:${point.inventoryLocation}`,
      },
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
