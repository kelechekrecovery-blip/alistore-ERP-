import { Injectable, Logger } from '@nestjs/common';
import { isAnthropic } from './llm/llm-client';
import { fastModel, resolveLlmClient } from './llm/llm.factory';
import {
  buildModerationMessages,
  coerceModeration,
  moderateByRules,
  MODERATION_SCHEMA,
  MODERATION_SYSTEM,
  ModerationResult,
} from './moderation';

/**
 * Content moderation (Phase 11). Screens user-generated text — product reviews and
 * storefront CMS copy — before it is published. Keyless stop-word rules by default; a
 * structured-output provider (Claude) classifies more accurately when configured, and
 * any provider error falls back to rules. Read-only: returns a verdict, never mutates.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  async moderate(text: string): Promise<ModerationResult> {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return { allowed: true, categories: [], reason: '', source: 'rules' };

    const fallback = moderateByRules(trimmed);
    const client = resolveLlmClient();
    if (!client?.supportsStructuredOutput) return fallback;

    try {
      const res = await client.chat(buildModerationMessages(trimmed), {
        system: MODERATION_SYSTEM,
        cacheSystem: true,
        jsonSchema: MODERATION_SCHEMA,
        // AI_FAST_MODEL names a Claude model — never send it to a non-Anthropic provider.
        model: isAnthropic(client) ? fastModel() : undefined,
        maxTokens: 300,
      });
      const coerced = coerceModeration(res.parsed, res.source);
      if (!coerced) {
        // Успешный вызов, но ответ не по схеме (нет boolean `allowed`). Раньше
        // тихо падали на keyword-rules — и постоянный сбой схемы (смена модели,
        // особенность провайдера) навсегда и незаметно отключал модерацию
        // контента. Логируем так же, как соседний catch: «сбой, выданный за
        // норму» отличим от «провайдер выключен намеренно».
        this.logger.warn(`LLM moderation returned off-schema output (source=${res.source}), using rules`);
        return fallback;
      }
      return coerced;
    } catch (err) {
      this.logger.warn(`LLM moderation failed, using rules: ${String(err)}`);
      return fallback;
    }
  }
}
