import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditInput, AuditService } from '../../audit/audit.service';
import { EventType } from '../../audit/event-types';
import { ValidationError } from '../../common/errors';
import { classifySupplierPriceRows, parseSupplierPriceList } from './supplier-price-import.parser';
import {
  SupplierPriceImportMapping,
  SupplierPriceImportRow,
  SupplierPriceImportSummary,
} from './supplier-price-import.types';

/**
 * Слайс 4 плана docs/SUPPLY-TO-ORDER-PLAN.md.
 *
 * Прайс-лист поставщика — денежный документ, поэтому запись в один шаг здесь
 * запрещена архитектурой: stage() парсит и классифицирует, ничего не пишет в
 * Product, и сохраняет батч целиком (rows — уже готовый предпросмотр). apply()
 * читает именно эти rows — не парсит файл заново и не сверяет заново с
 * каталогом, — поэтому то, что показал предпросмотр, и то, что будет
 * применено, гарантированно совпадает.
 */
@Injectable()
export class SupplierPriceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async stage(
    file: Buffer,
    supplierId: string,
    mappingInput: SupplierPriceImportMapping | undefined,
    actor: string,
  ) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new ValidationError('supplier_not_found', `Поставщик ${supplierId} не найден`);
    }

    const mapping = await this.resolveMapping(supplierId, mappingInput);
    const rawRows = await parseSupplierPriceList(file, mapping);

    const skus = Array.from(new Set(rawRows.filter((r) => !r.error).map((r) => r.sku)));
    const barcodes = Array.from(
      new Set(rawRows.filter((r) => !r.error && r.barcode).map((r) => r.barcode as string)),
    );
    const products = await this.prisma.product.findMany({
      where: { OR: [{ sku: { in: skus } }, ...(barcodes.length ? [{ barcode: { in: barcodes } }] : [])] },
      select: { id: true, sku: true, barcode: true, cost: true, supplyLeadDays: true, supplierId: true },
    });

    const { rows, summary } = classifySupplierPriceRows(rawRows, products, supplierId);

    const batch = await this.audit.transaction(async (tx) => {
      const created = await tx.supplierPriceImportBatch.create({
        data: {
          supplierId,
          mapping: mapping as unknown as Prisma.InputJsonValue,
          rows: rows as unknown as Prisma.InputJsonValue,
          summary: summary as unknown as Prisma.InputJsonValue,
          createdBy: actor,
        },
      });
      const events: AuditInput[] = [
        {
          type: EventType.SupplierPriceImportStaged,
          actor,
          payload: { batchId: created.id, supplierId, ...summary },
          refs: [created.id, supplierId],
        },
      ];
      return { result: created, events };
    });

    return { batchId: batch.id, supplierId, mapping, rows, summary };
  }

  async get(batchId: string) {
    const batch = await this.prisma.supplierPriceImportBatch.findUnique({
      where: { id: batchId },
      include: { application: true },
    });
    if (!batch) throw new ValidationError('batch_not_found', `Батч ${batchId} не найден`);
    return {
      batchId: batch.id,
      supplierId: batch.supplierId,
      mapping: batch.mapping as unknown as SupplierPriceImportMapping,
      rows: batch.rows as unknown as SupplierPriceImportRow[],
      summary: batch.summary as unknown as SupplierPriceImportSummary,
      applied: batch.application !== null,
    };
  }

  /**
   * Apply is idempotent by construction: the second attempt hits
   * `SupplierPriceImportApplication.batchId` (unique), guarded first by an
   * advisory lock so a concurrent second call blocks instead of racing past
   * the lookup — not a bare check-then-write in application code.
   */
  async apply(batchId: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`supplier-price-import:${batchId}`}))`;
      const batch = await tx.supplierPriceImportBatch.findUnique({
        where: { id: batchId },
        include: { application: true },
      });
      if (!batch) throw new ValidationError('batch_not_found', `Батч ${batchId} не найден`);

      if (batch.application) {
        const summary = batch.application.summary as unknown as Record<string, unknown>;
        return { result: { batchId, idempotent: true, ...summary }, events: [] };
      }

      const rows = batch.rows as unknown as SupplierPriceImportRow[];
      const toApply = rows.filter((r) => r.changedFields.length > 0 && r.matchedProductId);

      const events: AuditInput[] = [];
      let appliedCount = 0;
      for (const row of toApply) {
        const product = await tx.product.findUnique({ where: { id: row.matchedProductId as string } });
        if (!product) continue; // deleted between stage and apply — nothing to write

        const data: Prisma.ProductUpdateInput = {};
        if (row.changedFields.includes('cost') && row.newCost !== null) data.cost = row.newCost;
        if (row.changedFields.includes('supplyLeadDays')) data.supplyLeadDays = row.newLeadDays;
        if (row.changedFields.includes('supplierId')) data.supplier = { connect: { id: batch.supplierId } };
        if (Object.keys(data).length === 0) continue;

        await tx.product.update({ where: { id: product.id }, data });
        appliedCount += 1;

        if (row.changedFields.includes('cost') && row.newCost !== null) {
          events.push({
            type: EventType.ProductCostChanged,
            actor,
            payload: {
              productId: product.id,
              sku: product.sku,
              from: product.cost,
              to: row.newCost,
              deltaPct:
                product.cost === 0
                  ? null
                  : Math.round(((row.newCost - product.cost) / product.cost) * 1000) / 10,
              batchId,
            },
            refs: [product.id, product.sku, batchId],
          });
        }
        const otherChanges = row.changedFields.filter((f) => f !== 'cost');
        if (otherChanges.length > 0) {
          events.push({
            type: EventType.ProductUpdated,
            actor,
            payload: {
              productId: product.id,
              sku: product.sku,
              changes: otherChanges,
              from: {
                supplyLeadDays: product.supplyLeadDays,
                supplierId: product.supplierId,
              },
              to: {
                supplyLeadDays: otherChanges.includes('supplyLeadDays') ? row.newLeadDays : product.supplyLeadDays,
                supplierId: otherChanges.includes('supplierId') ? batch.supplierId : product.supplierId,
              },
              batchId,
            },
            refs: [product.id, product.sku, batchId],
          });
        }
      }

      const summary = {
        total: rows.length,
        applied: appliedCount,
        unmatched: rows.filter((r) => r.type === 'unmatched').length,
        ambiguous: rows.filter((r) => r.type === 'ambiguous').length,
        invalid: rows.filter((r) => r.type === 'invalid').length,
        noChange: rows.filter((r) => r.type === 'no_change').length,
      };

      events.push({
        type: EventType.SupplierPriceImportApplied,
        actor,
        payload: { batchId, supplierId: batch.supplierId, ...summary },
        refs: [batchId, batch.supplierId],
      });

      await tx.supplierPriceImportApplication.create({
        data: { batchId, appliedBy: actor, summary: summary as unknown as Prisma.InputJsonValue },
      });

      return { result: { batchId, idempotent: false, ...summary }, events };
    });
  }

  private async resolveMapping(
    supplierId: string,
    mappingInput: SupplierPriceImportMapping | undefined,
  ): Promise<SupplierPriceImportMapping> {
    if (mappingInput) {
      if (!mappingInput.sku?.trim() || !mappingInput.price?.trim()) {
        throw new ValidationError('mapping_incomplete', 'mapping обязан задавать sku и price');
      }
      return mappingInput;
    }
    const last = await this.prisma.supplierPriceImportBatch.findFirst({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      select: { mapping: true },
    });
    if (!last) {
      throw new ValidationError(
        'mapping_required',
        'Для этого поставщика ещё нет сохранённого mapping колонок — укажите его явно',
      );
    }
    return last.mapping as unknown as SupplierPriceImportMapping;
  }
}
