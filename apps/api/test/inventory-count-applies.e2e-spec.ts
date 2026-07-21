import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Инвентаризация обязана менять остаток.
 *
 * `count()` считал `expected`, писал `InventoryMovement(type:'count')` и событие
 * — и **не трогал** `InventoryBalance.onHand`. UI при этом рапортовал «✓ Учтено
 * 25, расхождение 25», владелец уходил домой, а склад оставался пуст.
 *
 * Для количественного товара инвентаризация «с нуля» — единственный способ
 * завести остаток, кроме приёмки. Для серийного товара расхождение означает
 * пропажу или излишек конкретных IMEI и требует ручного разбора, поэтому там
 * остаток править нельзя — только зафиксировать сигнал.
 */
describe('Инвентаризация · остаток приводится к пересчитанному', () => {
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

  afterAll(async () => {
    const mine = await prisma.product.findMany({ where: { sku: { startsWith: `CNT-${run}-` } }, select: { id: true } });
    const ids = mine.map((r) => r.id);
    if (ids.length) {
      await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventoryMovement.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventoryBalance.deleteMany({ where: { productId: { in: ids } } });
      await prisma.$transaction(async (tx) => {
        await tx.accountingJournalLine.deleteMany({ where: { entry: { sourceType: 'inventory.adjustment', sourceRef: { in: ids.map((id) => id) } } } });
      });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }
  });

  async function quantityProduct() {
    seq += 1;
    return prisma.product.create({
      data: {
        sku: `CNT-${run}-${seq}`, name: 'Кабель', price: 1200, cost: 800,
        category: 'accessories', trackingMode: 'quantity', attrs: {},
      },
    });
  }

  it('пересчёт с нуля заводит остаток количественного товара', async () => {
    const product = await quantityProduct();

    await inventory.count(
      { productId: product.id, location: 'BISHKEK-1', counted: 25 },
      'warehouse-1',
    );

    const balance = await prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    });
    expect(balance?.onHand).toBe(25);
  });

  it('повторный пересчёт доводит остаток до нового значения, а не суммирует', async () => {
    const product = await quantityProduct();

    await inventory.count({ productId: product.id, location: 'BISHKEK-1', counted: 25 }, 'warehouse-1');
    await inventory.count({ productId: product.id, location: 'BISHKEK-1', counted: 18 }, 'warehouse-1');

    const balance = await prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    });
    expect(balance?.onHand).toBe(18);
  });
});
