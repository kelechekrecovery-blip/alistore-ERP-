import { Workbook } from 'exceljs';
import { PrismaService } from '../src/prisma/prisma.service';
import { ImportService } from '../src/import/import.service';
import { ValidationError } from '../src/common/errors';

/**
 * exceljs product import — real xlsx round-trip against Postgres. No global wipe
 * (grown FK-linked schema): unique SKUs per run.
 */
describe('ImportService (exceljs)', () => {
  let prisma: PrismaService;
  let importer: ImportService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    importer = new ImportService(prisma);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'SKU-' } } });
    await prisma.$disconnect();
  });

  async function xlsx(rows: (string | number)[][]): Promise<Buffer> {
    return xlsxWithHeader(['sku', 'name', 'price', 'cost', 'category'], rows);
  }

  async function xlsxWithHeader(header: (string | number)[], rows: (string | number)[][]): Promise<Buffer> {
    const wb = new Workbook();
    const ws = wb.addWorksheet('products');
    ws.addRow(header);
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('imports valid products (upsert by SKU) and reports bad rows', async () => {
    const buf = await xlsx([
      [`SKU-X-${RUN}-1`, 'iPhone 15', 100000, 80000, 'phones'],
      [`SKU-X-${RUN}-2`, 'Чехол', 500, 200, 'accessories'],
      [`SKU-X-${RUN}-3`, '', 'notanumber', 0, 'phones'], // no name + non-numeric price
    ]);

    const res = await importer.importProducts(buf);
    expect(res.created).toBe(2);
    expect(res.unchanged).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].sku).toBe(`SKU-X-${RUN}-3`);

    const p = await prisma.product.findUnique({ where: { sku: `SKU-X-${RUN}-1` } });
    expect(p?.name).toBe('iPhone 15');
    expect(p?.price).toBe(100000);
  });

  it('updates an existing product on re-import', async () => {
    await importer.importProducts(
      await xlsx([[`SKU-X-${RUN}-9`, 'Old', 100, 50, 'phones']]),
    );
    const res = await importer.importProducts(
      await xlsx([[`SKU-X-${RUN}-9`, 'New name', 120, 60, 'phones']]),
    );
    expect(res.updated).toBe(1);
    expect(res.created).toBe(0);
    expect(res.unchanged).toBe(0);

    const p = await prisma.product.findUnique({ where: { sku: `SKU-X-${RUN}-9` } });
    expect(p?.name).toBe('New name');
    expect(p?.price).toBe(120);
  });

  it('is idempotent when the same workbook is imported again', async () => {
    const sku = `SKU-X-${RUN}-IDEMP`;
    const buf = await xlsx([[sku, 'Same Phone', 1000, 700, 'phones']]);

    expect(await importer.importProducts(buf)).toMatchObject({ created: 1, updated: 0, unchanged: 0 });
    expect(await importer.importProducts(buf)).toMatchObject({ created: 0, updated: 0, unchanged: 1 });

    expect(await prisma.product.count({ where: { sku } })).toBe(1);
  });

  it('rejects a file missing required columns', async () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('p');
    ws.addRow(['sku', 'name']); // missing price/cost/category
    ws.addRow(['SKU-Z', 'x']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const err = await importer.importProducts(buf).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('missing_columns');
  });

  /**
   * Русская шапка. Файл владельца называет колонки «Артикул / Наименование /
   * Цена / Себестоимость / Категория», а импорт матчил только латинские
   * заголовки и падал с missing_columns.
   */
  it('принимает русские заголовки колонок', async () => {
    const buf = await xlsxWithHeader(
      ['Артикул', 'Наименование', 'Цена', 'Себестоимость', 'Категория'],
      [[`SKU-RU-${RUN}-1`, 'Наушники', 3000, 1800, 'accessories']],
    );
    const res = await importer.importProducts(buf);
    expect(res.created).toBe(1);
    const p = await prisma.product.findUnique({ where: { sku: `SKU-RU-${RUN}-1` } });
    expect(p?.name).toBe('Наушники');
  });

  /**
   * По умолчанию импортированный товар — количественный. Схема ставит
   * `serialized`, и аксессуары попадали в IMEI-учёт: их нельзя было оприходовать
   * количеством. Колонка tracking_mode позволяет явно завести серийный товар.
   */
  it('импортирует товар как количественный по умолчанию и уважает tracking_mode', async () => {
    const buf = await xlsxWithHeader(
      ['sku', 'name', 'price', 'cost', 'category', 'tracking_mode'],
      [
        [`SKU-TM-${RUN}-q`, 'Кабель', 500, 200, 'accessories', ''],
        [`SKU-TM-${RUN}-s`, 'iPhone', 100000, 80000, 'phones', 'serialized'],
      ],
    );
    const res = await importer.importProducts(buf);
    expect(res.created).toBe(2);
    const accessory = await prisma.product.findUniqueOrThrow({ where: { sku: `SKU-TM-${RUN}-q` } });
    const phone = await prisma.product.findUniqueOrThrow({ where: { sku: `SKU-TM-${RUN}-s` } });
    expect(accessory.trackingMode).toBe('quantity');
    expect(phone.trackingMode).toBe('serialized');
  });
});
