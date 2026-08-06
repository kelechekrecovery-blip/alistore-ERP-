import { CampaignsService } from '../src/campaigns/campaigns.service';
import type { AudienceCustomer } from '../src/campaigns/segment-builder';

describe('campaign reachable audience limit', () => {
  it('filters phone-less customers before applying the delivery cap', () => {
    const service = new CampaignsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const phoneLess: AudienceCustomer = {
      id: 'social-first',
      name: 'Social customer',
      phone: null,
      consent: true,
      segments: [],
      ltv: 0,
      spent: 0,
    };
    const reachable: AudienceCustomer = {
      ...phoneLess,
      id: 'phone-customer',
      phone: '+996700123456',
    };
    const matched = [phoneLess, reachable].map((customer) => ({ customer, eligible: true }));

    const audience = (service as unknown as {
      eligibleAudience: (
        rows: typeof matched,
        limit: number,
        isReachable: (customer: AudienceCustomer) => boolean,
      ) => AudienceCustomer[];
    }).eligibleAudience(matched, 1, (customer) => customer.phone !== null);

    expect(audience.map((customer) => customer.id)).toEqual(['phone-customer']);
  });
});
