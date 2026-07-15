import { Injectable, Logger } from '@nestjs/common';
import {
  buildVisionGradingMessages,
  gradePhotosByRules,
  gradingSystemPrompt,
  OpenRouterPhotoGradingProvider,
  parsePhotoGradingResponse,
  PhotoGradingInput,
  PhotoGradingResult,
  PHOTO_GRADING_SCHEMA,
} from './grading';
import { resolvePhotoImages } from './llm/image-resolver';
import { resolveLlmClient } from './llm/llm.factory';

/**
 * Photo grading for used devices (Phase 11). Three tiers, degrading gracefully:
 *   1. A vision-capable provider (Claude) grades from the actual pixels.
 *   2. A text-only provider (OpenRouter) grades from labels/URLs.
 *   3. The keyless rule engine (`gradePhotosByRules`) grades from intake findings.
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
      if (client.supportsVision) return await this.gradeWithVision(input, client, fallback);
      // Text-only provider (OpenRouter) — keep the legacy label/URL path.
      const key = process.env.AI_PROVIDER_KEY ?? process.env.OPENROUTER_API_KEY;
      if (!key) return fallback;
      return await new OpenRouterPhotoGradingProvider({ apiKey: key, model: process.env.AI_MODEL }).grade(input);
    } catch (err) {
      this.logger.warn(`AI photo grading failed, using rule fallback: ${String(err)}`);
      return { ...fallback, source: `${fallback.source} (fallback)` };
    }
  }

  private async gradeWithVision(
    input: PhotoGradingInput,
    client: NonNullable<ReturnType<typeof resolveLlmClient>>,
    fallback: PhotoGradingResult,
  ): Promise<PhotoGradingResult> {
    const images = await resolvePhotoImages(input.photos);
    if (images.length === 0) {
      // No pixels to look at — don't ask the model to hallucinate; grade by rules.
      this.logger.debug('vision grading: no photos resolved, using rule fallback');
      return { ...fallback, source: `${fallback.source} (no photos resolved)` };
    }
    const res = await client.chat(buildVisionGradingMessages(input, images), {
      system: gradingSystemPrompt(),
      jsonSchema: PHOTO_GRADING_SCHEMA,
      maxTokens: 700,
    });
    return { source: res.source, ...parsePhotoGradingResponse(res.text) };
  }
}
