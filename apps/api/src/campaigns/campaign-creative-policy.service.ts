import { Injectable } from '@nestjs/common';
import { ModerationService } from '../ai/moderation.service';
import { ValidationError } from '../common/errors';

type CampaignCreativeCopy = {
  creativeHeadline?: string | null;
  creativeBody?: string | null;
  creativeCtaLabel?: string | null;
};

@Injectable()
export class CampaignCreativePolicyService {
  constructor(private readonly moderation: ModerationService) {}

  async assertAllowed(input: CampaignCreativeCopy): Promise<void> {
    const text = [input.creativeHeadline, input.creativeBody, input.creativeCtaLabel]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n');
    if (!text) return;

    const verdict = await this.moderation.moderate(text);
    if (!verdict.allowed) {
      throw new ValidationError(
        'campaign_creative_flagged',
        verdict.reason || verdict.categories.join(', '),
      );
    }
  }
}
