import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { assessDevice, Valuation } from './valuation';
import { AssessDto } from './valuation.dto';

/**
 * Used-device valuation (Phase 11, keyless). Resolves the new-equivalent price (from a
 * SKU or the caller) and runs the rule-based depreciation engine. The photo-grading /
 * market-price LLM providers plug in behind the same call when a key is configured.
 */
@Injectable()
export class ValuationService {
  constructor(private readonly prisma: PrismaService) {}

  async assess(dto: AssessDto): Promise<Valuation> {
    let basePrice = dto.basePrice ?? 0;
    if (dto.sku) {
      const product = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (!product) {
        throw new ValidationError('product_not_found', `SKU ${dto.sku} не найден`);
      }
      basePrice = product.price;
    }
    if (basePrice <= 0) {
      throw new ValidationError('base_price_required', 'Укажите basePrice или существующий sku');
    }
    return assessDevice({
      basePrice,
      grade: dto.grade,
      ageMonths: dto.ageMonths ?? 0,
      defects: dto.defects ?? [],
    });
  }
}
