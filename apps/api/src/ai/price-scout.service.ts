import { Injectable, Logger } from '@nestjs/common';
import { ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  OpenRouterPriceScoutProvider,
  PriceScoutInput,
  PriceScoutResult,
  scoutPriceByRules,
} from './price-scout';

@Injectable()
export class PriceScoutService {
  private readonly logger = new Logger(PriceScoutService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scout(dto: {
    sku?: string;
    name?: string;
    category?: string;
    basePrice?: number;
    observedListings?: { title?: string; source?: string; condition?: string; price: number }[];
  }): Promise<PriceScoutResult> {
    const input = await this.resolve(dto);
    const fallback = scoutPriceByRules(input);
    const key = process.env.AI_PROVIDER_KEY ?? process.env.OPENROUTER_API_KEY;
    if (!key) return fallback;

    try {
      return await new OpenRouterPriceScoutProvider({ apiKey: key, model: process.env.AI_MODEL }).scout(input);
    } catch (err) {
      this.logger.warn(`AI price scout failed, using rule fallback: ${String(err)}`);
      return { ...fallback, source: 'rules (fallback)' };
    }
  }

  private async resolve(dto: {
    sku?: string;
    name?: string;
    category?: string;
    basePrice?: number;
    observedListings?: PriceScoutInput['observedListings'];
  }): Promise<PriceScoutInput> {
    if (dto.sku) {
      const product = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (!product) throw new ValidationError('product_not_found', `SKU ${dto.sku} не найден`);
      return {
        sku: product.sku,
        name: product.name,
        category: product.category,
        basePrice: product.price,
        observedListings: dto.observedListings ?? [],
      };
    }
    if (!dto.name) throw new ValidationError('name_required', 'Укажите sku или name');
    if (!dto.basePrice || dto.basePrice <= 0) {
      throw new ValidationError('base_price_required', 'Укажите basePrice или существующий sku');
    }
    return {
      name: dto.name,
      category: dto.category,
      basePrice: dto.basePrice,
      observedListings: dto.observedListings ?? [],
    };
  }
}
