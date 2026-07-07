import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PriceRec, suggestPrice } from './pricing';

export interface PricingReview extends PriceRec {
  sku: string;
  name: string;
  category: string;
  inStock: number;
  soldUnits: number;
}

export interface PricingReport {
  source: 'rules';
  generatedForCount: number;
  actionable: number; // count of non-'hold' recommendations
  reviews: PricingReview[];
}

/**
 * Dynamic-pricing review (Phase 11, keyless). Reads live stock (in_stock units) and
 * demand (sold units) per product and runs the rule engine. A market-scouting LLM
 * provider plugs in behind suggestPrice() when a key is configured — this stays the
 * deterministic fallback. Read-only; никаких мутаций цен, только рекомендации.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async review(): Promise<PricingReport> {
    const products = await this.prisma.product.findMany({
      where: { archived: false },
      select: { sku: true, name: true, price: true, category: true, id: true },
    });

    const grouped = await this.prisma.deviceUnit.groupBy({
      by: ['productId', 'status'],
      _count: { _all: true },
    });

    const counts = new Map<string, { inStock: number; soldUnits: number }>();
    for (const row of grouped) {
      const cur = counts.get(row.productId) ?? { inStock: 0, soldUnits: 0 };
      if (row.status === 'in_stock') cur.inStock += row._count._all;
      else if (row.status === 'sold') cur.soldUnits += row._count._all;
      counts.set(row.productId, cur);
    }

    const reviews: PricingReview[] = products.map((p) => {
      const c = counts.get(p.id) ?? { inStock: 0, soldUnits: 0 };
      const rec = suggestPrice({ basePrice: p.price, inStock: c.inStock, soldUnits: c.soldUnits });
      return { sku: p.sku, name: p.name, category: p.category, inStock: c.inStock, soldUnits: c.soldUnits, ...rec };
    });

    // Actionable recommendations first, ranked by magnitude of the suggested move.
    reviews.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
    const actionable = reviews.filter((r) => r.action !== 'hold').length;

    return { source: 'rules', generatedForCount: reviews.length, actionable, reviews };
  }
}
