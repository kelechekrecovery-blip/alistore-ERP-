import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Приёмка количественного товара не должна удваивать остаток.
 *
 * `receiveQuantity` был единственным путём оприходования собственного
 * количественного стока без ключа идемпотентности — при том, что три соседние
 * функции в том же файле его имеют. Повтор запроса (потерянный ответ, ретрай
 * кладовщика) увеличивал `onHand`, `inventoryValue`, создавал второе движение и
 * второй слой оценки.
 *
 * Самое неприятное: удвоение было **согласованным**, поэтому
 * `valuationReconciliation` сравнивала количество слоёв с `onHand` и объявляла
 * состояние здоровым. Приписка становилась видна только при инвентаризации —
 * уже как недостача с назначенным виновным.
 */
describe('Приёмка количественного товара · идемпотентность', () => {
  let prisma: PrismaService;
  let inventory: InventoryService;
  const run = Math.floor(Math.random() * 1_000_000);
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    inventory = new InventoryService(prisma, audit, new ApprovalsService(prisma, audit));
  });

  /**
   * Спек заводит товары, движения и слои оценки — и обязан их унести. Без этого
   * соседние спеки падают на `product.deleteMany()` по внешнему ключу, и виноват
   * в их падении не продукт, а тест.
   */
  afterAll(async () => {
    const mine = await prisma.product.findMany({
      where: { sku: { startsWith: `RQI-${run}-` } },
      select: { id: true },
    });
    const ids = mine.map((row) => row.id);
    if (ids.length > 0) {
      await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventoryMovement.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventoryBalance.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  async function quantityProduct() {
    seq += 1;
    return prisma.product.create({
      data: {
        sku: `RQI-${run}-${seq}`,
        name: 'Кабель USB-C',
        price: 1_200,
        cost: 800,
        category: 'accessories',
        trackingMode: 'quantity',
        attrs: {},
      },
    });
  }

  it('повтор с тем же ключом не увеличивает остаток второй раз', async () => {
    const product = await quantityProduct();
    const key = `recv-${run}-${seq}`;
    const payload = { idempotencyKey: key, productId: product.id, location: 'BISHKEK-1', quantity: 25 };

    const first = await inventory.receiveQuantity(payload, 'warehouse-1');
    const replay = await inventory.receiveQuantity(payload, 'warehouse-1');

    expect(first.onHand).toBe(25);
    expect(replay.onHand).toBe(25);
    expect(replay.movementId).toBe(first.movementId);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    });
    expect(balance.onHand).toBe(25);
    // Слои оценки и движения обязаны остаться единичными: именно их
    // согласованное удвоение делало приписку невидимой для сверки.
    expect(await prisma.inventoryMovement.count({ where: { productId: product.id, type: 'received' } })).toBe(1);
    expect(await prisma.inventoryValuationLayer.count({ where: { productId: product.id } })).toBe(1);
  });

  it('тот же ключ с другим содержимым отклоняется', async () => {
    const product = await quantityProduct();
    const key = `recv-mismatch-${run}-${seq}`;
    await inventory.receiveQuantity(
      { idempotencyKey: key, productId: product.id, location: 'BISHKEK-1', quantity: 10 },
      'warehouse-1',
    );

    await expect(inventory.receiveQuantity(
      { idempotencyKey: key, productId: product.id, location: 'BISHKEK-1', quantity: 99 },
      'warehouse-1',
    )).rejects.toMatchObject({ code: 'receive_idempotency_mismatch' });

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    });
    expect(balance.onHand).toBe(10);
  });
});
