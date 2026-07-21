import { Injectable, Logger } from '@nestjs/common';
import {
  buildPhotoGradingMessages,
  buildVisionGradingMessages,
  gradePhotosByRules,
  gradingSystemPrompt,
  parsePhotoGradingResponse,
  PhotoGradingInput,
  PhotoGradingResult,
  PHOTO_GRADING_SCHEMA,
} from './grading';
import { resolvePhotoImages } from './llm/image-resolver';
import type { LlmClient } from './llm/llm-client';
import { resolveLlmClient } from './llm/llm.factory';

/**
 * Photo grading for used devices (Phase 11). Tiers, degrading gracefully:
 *   1. A vision-capable provider (Claude, or OpenRouter's multimodal models) grades from
 *      the actual pixels when photo URLs resolve to images.
 *   2. Otherwise the same provider grades from labels/questionnaire as text (the prompt
 *      tells it to lower confidence without pixels).
 *   3. The keyless rule engine (`gradePhotosByRules`) runs with no key.
 * Any provider error falls back to rules, so the endpoint never fails because the AI API
 * is down. The provider key stays server-side.
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  async grade(input: PhotoGradingInput): Promise<PhotoGradingResult> {
    const fallback = gradePhotosByRules(input);
    const client = resolveLlmClient();
    if (!client) return fallback;

    try {
      if (client.supportsVision) {
        const images = await resolvePhotoImages(input.photos);
        if (images.length > 0) {
          // Сбой СВЯЗИ и брак РАЗБОРА — разные случаи, и раньше их ловил один
          // catch. Если vision-вызов прошёл, но ответ не распарсился, повтор
          // уходил в gradeFromLabels — второй платный вызов той же модели с тем
          // же промптом, то есть двойная оплата ровно за отказной случай.
          let res: Awaited<ReturnType<typeof client.chat>> | null = null;
          try {
            res = await client.chat(buildVisionGradingMessages(input, images), {
              system: gradingSystemPrompt(),
              jsonSchema: PHOTO_GRADING_SCHEMA,
              maxTokens: 700,
            });
          } catch (error) {
            this.logger.warn(`vision grading transport failed, retrying from labels: ${String(error)}`);
          }
          if (res) {
            // Ответ получен и оплачен. Не разбирается — это брак модели, и
            // лечится он бесплатным правилом, а не вторым платным вызовом:
            // ошибка разбора летит во внешний catch.
            return { source: res.source, ...parsePhotoGradingResponse(res.text) };
          }
        }
        this.logger.debug('vision grading: no photos resolved, grading from labels');
      }
      return await this.gradeFromLabels(input, client);
    } catch (err) {
      this.logger.warn(`AI photo grading failed, using rule fallback: ${String(err)}`);
      return { ...fallback, source: `${fallback.source} (fallback)` };
    }
  }

  /** Text path — grade from intake labels/questionnaire when no pixels are available. */
  private async gradeFromLabels(input: PhotoGradingInput, client: LlmClient): Promise<PhotoGradingResult> {
    const [, user] = buildPhotoGradingMessages(input);
    const res = await client.chat([{ role: 'user', content: user.content }], {
      // One shared persona+rubric for both paths, so text grading follows the intake policy.
      system: gradingSystemPrompt(),
      jsonSchema: PHOTO_GRADING_SCHEMA,
      maxTokens: 700,
    });
    return { source: res.source, ...parsePhotoGradingResponse(res.text) };
  }
}
