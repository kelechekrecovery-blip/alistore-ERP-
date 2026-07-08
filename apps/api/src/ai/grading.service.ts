import { Injectable, Logger } from '@nestjs/common';
import {
  gradePhotosByRules,
  OpenRouterPhotoGradingProvider,
  PhotoGradingInput,
  PhotoGradingResult,
} from './grading';

@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  async grade(input: PhotoGradingInput): Promise<PhotoGradingResult> {
    const fallback = gradePhotosByRules(input);
    const key = process.env.AI_PROVIDER_KEY ?? process.env.OPENROUTER_API_KEY;
    if (!key) return fallback;

    try {
      return await new OpenRouterPhotoGradingProvider({ apiKey: key, model: process.env.AI_MODEL }).grade(input);
    } catch (err) {
      this.logger.warn(`AI photo grading failed, using rule fallback: ${String(err)}`);
      return { ...fallback, source: 'rules (fallback)' };
    }
  }
}
