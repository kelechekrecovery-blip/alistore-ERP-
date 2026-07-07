import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReorderRec, ReorderUrgency, suggestReorder } from './reorder';

export interface ReorderReview extends ReorderRec {
  sku: string;
  name: string;
  category: string;
  inStock: number;
  reserved: number;
  soldUnits: number;
}

export interface ReorderReport {
  source: 'rules';
  generatedForCount: number;
  needsReorder: number; // count of SKUs flagged for restock
  reviews: ReorderReview[];
}

const URGENCY_RANK: Record<ReorderUrgency, number> = { high: 3, medium: 2, low: 1, none: 0 };

/**
 * Restock review (Phase 11, keyless). Reads live stock (in_stock / reserved) and demand
 * (sold) per product and runs the rule engine. A demand-forecasting LLM plugs in behind
 * suggestReorder() when a key is configured — this stays the deterministic fallback.
 */
@Injectable()
export class ReorderService {
  constructor(private readonly prisma: PrismaService) {}

  async review(): Promise<ReorderReport> {
    const products = await this.prisma.product.findMany({
      where: { archived: false },
      select: { sku: true, name: true, category: true, id: true },
    });

    const grouped = await this.prisma.deviceUnit.groupBy({
      by: ['productId', 'status'],
      _count: { _all: true },
    });

    const counts = new Map<string, { inStock: number; reserved: number; soldUnits: number }>();
    for (const row of grouped) {
      const cur = counts.get(row.productId) ?? { inStock: 0, reserved: 0, soldUnits: 0 };
      if (row.status === 'in_stock') cur.inStock += row._count._all;
      else if (row.status === 'reserved') cur.reserved += row._count._all;
      else if (row.status === 'sold') cur.soldUnits += row._count._all;
      counts.set(row.productId, cur);
    }

    const reviews: ReorderReview[] = products.map((p) => {
      const c = counts.get(p.id) ?? { inStock: 0, reserved: 0, soldUnits: 0 };
      const rec = suggestReorder({ inStock: c.inStock, reserved: c.reserved, soldUnits: c.soldUnits });
      return { sku: p.sku, name: p.name, category: p.category, ...c, ...rec };
    });

    // Most urgent first, then by suggested quantity.
    reviews.sort(
      (a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] || b.suggestedQty - a.suggestedQty,
    );
    const needsReorder = reviews.filter((r) => r.needsReorder).length;

    return { source: 'rules', generatedForCount: reviews.length, needsReorder, reviews };
  }
}
