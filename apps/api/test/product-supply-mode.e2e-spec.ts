import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { ProductsModule } from '../src/products/products.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { ProductsService } from '../src/products/products.service';
import { ValidationError } from '../src/common/errors';

/**
 * Срез 1 плана docs/SUPPLY-TO-ORDER-PLAN.md.
 *
 * Товар «под заказ» — это товар, которого нет на нашем складе и который мы
 * закупаем под конкретный заказ. Он обязан честно сообщать покупателю срок
 * поставки и обязан НЕ участвовать в стоке: availableUnits для него остаётся
 * вычисляемым из реальных остатков, то есть нулём.
 */
describe('Product supply mode', () => {
  let prisma: PrismaService;
  let catalog: CatalogService;
  let products: ProductsService;
  let seq = 0;

  beforeAll(async () => {
    delete process.env.MEILI_HOST;
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    catalog = new CatalogService(prisma, new ConfigService());
    products = new ProductsService(prisma, audit, new ApprovalsService(prisma, audit));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.product.deleteMany();
  });

  function sku(prefix: string) {
    seq += 1;
    return `${prefix}-${seq.toString().padStart(3, '0')}`;
  }

  async function createProduct(data: Record<string, unknown>) {
    return prisma.product.create({
      data: {
        name: 'Тестовый товар',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
        ...data,
      } as never,
    });
  }

  describe('инвариант срока поставки', () => {
    // Ассерт на имя констрейнта, а не на «что-нибудь упало»: иначе тест зеленеет
    // от любой посторонней ошибки Prisma и не заметит схему, поднятую db push
    // без CHECK-ов (см. предупреждение в CLAUDE.md).
    it('отклоняет to_order без указанного срока поставки', async () => {
      await expect(
        createProduct({ sku: sku('TOORDER-NOLEAD'), supplyMode: 'to_order', supplyLeadDays: null }),
      ).rejects.toThrow(/Product_supply_lead_days_check/);
    });

    it('отклоняет срок поставки вне диапазона 1..180 дней', async () => {
      await expect(
        createProduct({ sku: sku('TOORDER-HUGE'), supplyMode: 'to_order', supplyLeadDays: 400 }),
      ).rejects.toThrow(/Product_supply_lead_days_range_check/);
    });

    it('отклоняет срок поставки у товара своего стока', async () => {
      await expect(
        createProduct({ sku: sku('OWN-LEAD'), supplyMode: 'own_stock', supplyLeadDays: 7 }),
      ).rejects.toThrow(/Product_supply_lead_days_own_stock_check/);
    });

    it('разрешает own_stock без срока поставки', async () => {
      const product = await createProduct({ sku: sku('OWN'), supplyMode: 'own_stock' });
      expect((product as unknown as { supplyMode: string }).supplyMode).toBe('own_stock');
    });

    it('по умолчанию товар считается своим стоком', async () => {
      const product = await createProduct({ sku: sku('DEFAULT') });
      expect((product as unknown as { supplyMode: string }).supplyMode).toBe('own_stock');
    });
  });

  describe('проекция в публичный каталог', () => {
    it('отдаёт supplyMode и supplyLeadDays товара под заказ', async () => {
      const created = await createProduct({
        sku: sku('TOORDER-OK'),
        name: 'Товар под заказ',
        supplyMode: 'to_order',
        supplyLeadDays: 7,
      });

      const { product } = await catalog.product(created.id);

      expect(product).toMatchObject({ supplyMode: 'to_order', supplyLeadDays: 7 });
    });

    it('у товара своего стока supplyLeadDays равен null', async () => {
      const created = await createProduct({ sku: sku('OWN-NULL') });

      const { product } = await catalog.product(created.id);

      expect(product).toMatchObject({ supplyMode: 'own_stock', supplyLeadDays: null });
    });

    /**
     * Наличие обязано считаться из реальных остатков, а не из политики поставки.
     * Поэтому тест сравнивает два товара, отличающихся только политикой: один со
     * своей единицей на складе, другой без — и требует, чтобы политика на число
     * не влияла ни в одну сторону.
     */
    it('наличие берётся из остатков, а не из политики поставки', async () => {
      const stocked = await createProduct({ sku: sku('AVAIL-OWN') });
      await prisma.deviceUnit.create({
        data: {
          imei: `AVAIL-IMEI-${seq}`,
          productId: stocked.id,
          status: 'in_stock',
          location: 'BISHKEK-1',
        },
      });
      const toOrder = await createProduct({
        sku: sku('AVAIL-TOORDER'),
        supplyMode: 'to_order',
        supplyLeadDays: 5,
      });

      const stockedView = await catalog.product(stocked.id);
      const toOrderView = await catalog.product(toOrder.id);

      expect(stockedView.product.availableUnits).toBe(1);
      expect(toOrderView.product.availableUnits).toBe(0);
    });

    /**
     * Регрессия на утечку внутренних данных. toCatalogProduct перечисляет поля
     * руками именно затем, чтобы cost и поставщик не уехали на публичную витрину;
     * тест падает при появлении в DTO любого нового поля, чтобы это решение
     * принималось осознанно, а не через случайный spread.
     */
    it('не отдаёт закупочную цену и поставщика и держит набор полей фиксированным', async () => {
      const created = await createProduct({
        sku: sku('LEAK'),
        supplyMode: 'to_order',
        supplyLeadDays: 3,
      });

      const { product } = await catalog.product(created.id);

      expect(product).not.toHaveProperty('cost');
      expect(product).not.toHaveProperty('supplierId');
      expect(product).not.toHaveProperty('supplier');
      expect(Object.keys(product).sort()).toEqual([
        'attrs',
        'availabilityKind',
        'availableUnits',
        'avgRating',
        'barcode',
        'bundleComponents',
        'category',
        'estimatedDeliveryDate',
        'id',
        'leadTimeDays',
        'name',
        'orderable',
        'price',
        'reviewCount',
        'sku',
        'supplyLeadDays',
        'supplyMode',
        'trackingMode',
        'updatedAt',
        'variantGroup',
      ]);
    });
  });

  /**
   * GET /products/:id отдавал сырую строку Prisma вообще без гвардов: закупочную
   * цену, поставщика, признак архивности. Публичная витрина ходит в /catalog/*,
   * этот роут не потребляет никто — значит он чистая поверхность атаки.
   */
  describe('внутренние поля товара не отдаются анонимно', () => {
    let app: INestApplication;
    let httpPrisma: PrismaService;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          PrismaModule,
          AuditModule,
          StaffAuthModule,
          ProductsModule,
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      await app.init();
      httpPrisma = moduleRef.get(PrismaService);
    });

    afterAll(async () => {
      await app?.close();
    });

    it('GET /products/:id без токена не пускает', async () => {
      const created = await httpPrisma.product.create({
        data: {
          sku: sku('ANON'),
          name: 'Товар',
          price: 100000,
          cost: 80000,
          category: 'phones',
          attrs: {},
        },
      });

      const res = await request(app.getHttpServer()).get(`/products/${created.id}`);

      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain('80000');
    });
  });

  describe('редактирование политики персоналом', () => {
    it('переводит товар под заказ и пишет это в леджер', async () => {
      const created = await createProduct({ sku: sku('EDIT-TOORDER') });

      const updated = await products.update(
        created.id,
        { supplyMode: 'to_order', supplyLeadDays: 10 } as never,
        'owner-1',
      );

      expect(updated).toMatchObject({ supplyMode: 'to_order', supplyLeadDays: 10 });
      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { type: 'product.updated', refs: { has: created.id } },
      });
      expect((event.payload as { changes: string[] }).changes).toEqual(
        expect.arrayContaining(['supplyMode', 'supplyLeadDays']),
      );
    });

    it('отказывает в переводе под заказ без срока поставки понятной ошибкой', async () => {
      const created = await createProduct({ sku: sku('EDIT-NOLEAD') });

      await expect(
        products.update(created.id, { supplyMode: 'to_order' } as never, 'owner-1'),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    /**
     * Инвариант «под заказ не участвует в стоке» держится только если товар с
     * реальными остатками нельзя объявить заказным. Иначе в срезе 2 обход гейта
     * insufficient_stock ляжет на товар, у которого сток есть, и обычный путь
     * резервирования продолжит списывать units — это двойная продажа.
     */
    it('не даёт объявить заказным товар, у которого есть свои остатки', async () => {
      const created = await createProduct({ sku: sku('EDIT-HASSTOCK') });
      await prisma.deviceUnit.create({
        data: {
          imei: `SUPPLY-IMEI-${seq}`,
          productId: created.id,
          status: 'in_stock',
          location: 'BISHKEK-1',
        },
      });

      await expect(
        products.update(
          created.id,
          { supplyMode: 'to_order', supplyLeadDays: 7 } as never,
          'owner-1',
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('возврат в свой сток обнуляет срок поставки', async () => {
      const created = await createProduct({
        sku: sku('EDIT-BACK'),
        supplyMode: 'to_order',
        supplyLeadDays: 14,
      });

      const updated = await products.update(
        created.id,
        { supplyMode: 'own_stock' } as never,
        'owner-1',
      );

      expect(updated).toMatchObject({ supplyMode: 'own_stock', supplyLeadDays: null });
    });
  });
});
