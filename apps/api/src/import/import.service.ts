import { Injectable, Optional } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { ImportResult, ImportRowError, ParsedProductRow } from './import.types';

const REQUIRED = ['sku', 'name', 'price', 'cost', 'category'] as const;

/**
 * Launch-time data migration — import products from an Excel file (Roadmap:
 * «Импорт данных из Excel/тетради»). Header row maps columns by name in any
 * order; rows upsert by SKU so re-imports are safe. Prices are whole сом (Int).
 * Every row mutation commits through the append-only Event Ledger
 * (product.created / product.updated / price.changed) in one transaction.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional only so direct unit construction (no Nest DI) keeps working;
    // the global AuditModule always injects it in the app.
    @Optional() private readonly audit?: AuditService,
  ) {}

  /** Parse a product Excel into structured rows (no writes). */
  async parseProducts(
    buffer: Buffer,
  ): Promise<{ rows: ParsedProductRow[]; errors: ImportRowError[] }> {
    const wb = new Workbook();
    // Node 22 types Buffer as Buffer<ArrayBufferLike>; exceljs expects the plain
    // Buffer overload — cast to its exact parameter type (runtime is a real Buffer).
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    if (!ws) {
      throw new ValidationError('empty_workbook', 'Пустой файл Excel');
    }

    const col: Record<string, number> = {};
    ws.getRow(1).eachCell((cell, c) => {
      const header = String(cell.value ?? '').trim().toLowerCase();
      if (header) col[header] = c;
    });
    const missing = REQUIRED.filter((h) => !col[h]);
    if (missing.length) {
      throw new ValidationError(
        'missing_columns',
        `Нет обязательных колонок: ${missing.join(', ')}`,
      );
    }

    const rows: ParsedProductRow[] = [];
    const errors: ImportRowError[] = [];
    for (let r = 2; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const sku = this.str(row.getCell(col.sku).value);
      if (!sku) continue; // skip blank lines
      const name = this.str(row.getCell(col.name).value);
      const price = this.num(row.getCell(col.price).value);
      const cost = this.num(row.getCell(col.cost).value);
      const category = this.str(row.getCell(col.category).value) || 'misc';
      if (!name || price === null || cost === null) {
        errors.push({
          row: r,
          sku,
          message: 'name обязателен; price/cost — числа',
        });
        continue;
      }
      rows.push({ sku, name, price, cost, category });
    }
    return { rows, errors };
  }

  /** Import products from Excel: upsert by SKU. Returns created/updated counts. */
  async importProducts(buffer: Buffer, actor = 'import'): Promise<ImportResult> {
    const { rows, errors } = await this.parseProducts(buffer);
    const audit = this.audit ?? new AuditService(this.prisma);
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    // Each row commits in its own transaction (as before): one bad row aborts
    // the import without rolling back the rows already applied.
    for (const p of rows) {
      const outcome = await audit.transaction(async (tx) => {
        const existing = await tx.product.findUnique({
          where: { sku: p.sku },
        });

        if (!existing) {
          const product = await tx.product.create({
            data: {
              sku: p.sku,
              name: p.name,
              price: p.price,
              cost: p.cost,
              category: p.category,
              attrs: {},
            },
          });
          return {
            result: 'created' as const,
            events: [
              {
                type: EventType.ProductCreated,
                actor,
                payload: {
                  productId: product.id,
                  sku: p.sku,
                  name: p.name,
                  price: p.price,
                  cost: p.cost,
                  category: p.category,
                },
                refs: [product.id, p.sku],
              },
            ],
          };
        }

        if (
          existing.name === p.name &&
          existing.price === p.price &&
          existing.cost === p.cost &&
          existing.category === p.category
        ) {
          return { result: 'unchanged' as const, events: [] };
        }

        const product = await tx.product.update({
          where: { sku: p.sku },
          data: {
            sku: p.sku,
            name: p.name,
            price: p.price,
            cost: p.cost,
            category: p.category,
          },
        });
        const events: AuditInput[] = [
          {
            type: EventType.ProductUpdated,
            actor,
            payload: {
              productId: product.id,
              sku: p.sku,
              changes: (['name', 'price', 'cost', 'category'] as const).filter(
                (field) => existing[field] !== p[field],
              ),
            },
            refs: [product.id, p.sku],
          },
        ];
        if (existing.price !== p.price) {
          events.push({
            type: EventType.PriceChanged,
            actor,
            payload: { productId: product.id, from: existing.price, to: p.price },
            refs: [product.id, p.sku],
          });
        }
        return { result: 'updated' as const, events };
      });
      if (outcome === 'created') created += 1;
      else if (outcome === 'updated') updated += 1;
      else unchanged += 1;
    }
    return { created, updated, unchanged, errors };
  }

  private str(value: unknown): string {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  private num(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
}
