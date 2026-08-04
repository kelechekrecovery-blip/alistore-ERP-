import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { buildDescription, buildDescriptionMessages, DescribeInput, ProductDescription } from './describe';
import { isAnthropic } from './llm/llm-client';
import { fastModel, resolveLlmClient } from './llm/llm.factory';

/**
 * Product card enrichment (Phase 11). Resolves a product (by SKU or inline fields) and
 * writes a customer-facing description. Keyless template by default; when a provider
 * (Claude or OpenRouter) is configured it asks the LLM and falls back to the template on
 * any error — so the endpoint never fails just because the AI API is down. Read-only:
 * returns copy, never mutates the product.
 */
@Injectable()
export class DescribeService {
  private readonly logger = new Logger(DescribeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async describe(dto: { sku?: string } & Partial<DescribeInput>): Promise<ProductDescription> {
    const input = await this.resolve(dto);
    const client = resolveLlmClient();
    if (!client) return buildDescription(input);

    // Reuse the existing prompt: system stays stable (cache it), the product payload varies.
    const [system, user] = buildDescriptionMessages(input);
    try {
      const res = await client.chat([{ role: 'user', content: user.content }], {
        system: system.content,
        cacheSystem: true,
        // AI_FAST_MODEL names a Claude model — only apply it to the Anthropic client, never
        // to OpenRouter (whose model comes from AI_MODEL and uses a different id namespace).
        model: isAnthropic(client) ? fastModel() : undefined,
        maxTokens: 400,
      });
      const description = res.text.trim();
      if (!description) throw new Error('empty LLM description');
      return { description, source: res.source, highlights: buildDescription(input).highlights };
    } catch (err) {
      this.logger.warn(`LLM describe failed, using template: ${String(err)}`);
      return buildDescription(input);
    }
  }

  /** Resolve the fields to describe — from a SKU lookup or the inline body. */
  private async resolve(dto: { sku?: string } & Partial<DescribeInput>): Promise<DescribeInput> {
    if (dto.sku) {
      const product = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (!product) throw new ValidationError('product_not_found', `SKU ${dto.sku} не найден`);
      return { name: product.name, category: product.category, attrs: (product.attrs as Record<string, unknown>) ?? {} };
    }
    if (!dto.name) throw new ValidationError('name_required', 'Укажите sku или name');
    return { name: dto.name, category: dto.category, attrs: dto.attrs ?? {} };
  }
}
