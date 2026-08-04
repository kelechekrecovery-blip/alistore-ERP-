import { Injectable, Logger } from '@nestjs/common';
import { ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { resolveLlmClient } from './llm/llm.factory';
import {
  buildPriceScoutMessages,
  parsePriceScoutResponse,
  PriceScoutInput,
  PriceScoutResult,
  PRICE_SCOUT_SCHEMA,
  scoutPriceByRules,
} from './price-scout';

/**
 * Market price scout (Phase 11). Keyless percentiles over manually-supplied listings by
 * default; when a provider (Claude or OpenRouter) is configured it asks the LLM behind the
 * shared LlmClient port (structured output on Anthropic) and falls back to rules on any
 * error — so the endpoint never fails because the AI API is down. Keys stay server-side.
 */
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
    const client = resolveLlmClient();
    if (!client) return fallback;

    try {
      const [system, user] = buildPriceScoutMessages(input);
      const res = await client.chat([{ role: 'user', content: user.content }], {
        system: system.content,
        cacheSystem: true,
        jsonSchema: PRICE_SCOUT_SCHEMA,
        maxTokens: 700,
      });
      return { source: res.source, ...parsePriceScoutResponse(res.text) };
    } catch (err) {
      this.logger.warn(`AI price scout failed, using rule fallback: ${String(err)}`);
      return { ...fallback, source: `${fallback.source} (fallback)` };
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
