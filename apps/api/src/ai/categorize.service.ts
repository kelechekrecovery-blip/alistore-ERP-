import { Injectable, Logger } from '@nestjs/common';
import {
  buildCategorizeMessages,
  CATEGORIZE_SCHEMA,
  CATEGORIZE_SYSTEM,
  CategorySuggestion,
  coerceCategorySuggestion,
  suggestCategory,
} from './categorize';
import { isAnthropic } from './llm/llm-client';
import { fastModel, resolveLlmClient } from './llm/llm.factory';

/**
 * Product auto-categorization (Phase 11). Keyless keyword rules by default; when a
 * structured-output provider (Claude) is configured it classifies into the same fixed
 * taxonomy via JSON schema and falls back to the rules on any error. High-volume path —
 * uses the cheaper `AI_FAST_MODEL` (e.g. Haiku) when set.
 */
@Injectable()
export class CategorizeService {
  private readonly logger = new Logger(CategorizeService.name);

  async suggest(name: string, attrs: Record<string, unknown> = {}): Promise<CategorySuggestion> {
    const fallback = suggestCategory(name, attrs);
    const client = resolveLlmClient();
    if (!client?.supportsStructuredOutput) return fallback;

    try {
      const res = await client.chat(buildCategorizeMessages(name, attrs), {
        system: CATEGORIZE_SYSTEM,
        cacheSystem: true,
        jsonSchema: CATEGORIZE_SCHEMA,
        // AI_FAST_MODEL names a Claude model — never send it to a non-Anthropic provider.
        model: isAnthropic(client) ? fastModel() : undefined,
        maxTokens: 400,
      });
      return coerceCategorySuggestion(res.parsed) ?? fallback;
    } catch (err) {
      this.logger.warn(`LLM categorize failed, using rules: ${String(err)}`);
      return fallback;
    }
  }
}
