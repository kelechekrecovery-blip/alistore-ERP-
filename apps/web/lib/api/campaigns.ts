import { getJson, postAuthJson } from './http';

export interface SegmentRules {
  level?: string;
  city?: string;
  tags?: string[];
  minSpent?: number;
  maxSpent?: number;
  minLtv?: number;
  maxLtv?: number;
  limit?: number;
}

export interface CampaignPreview {
  description: string;
  totalCustomers: number;
  matchedCustomers: number;
  eligibleCustomers: number;
  excludedNoConsent: number;
  audience: {
    id: string;
    name: string;
    phone: string;
    segments: string[];
    ltv: number;
    spent: number;
  }[];
}

export interface CampaignRoi {
  campaign: {
    id: string;
    segment: string;
    channel: string;
    budget: number;
    orders: number;
    revenue: number;
  };
  description: string;
  orders: number;
  revenue: number;
  budget: number;
  profit: number;
  roiPct: number | null;
}

export interface CreateCampaignInput extends SegmentRules {
  channel: 'sms' | 'push' | 'telegram' | 'whatsapp';
  budget: number;
  message?: string;
}

export function previewCampaign(rules: SegmentRules, accessToken: string): Promise<CampaignPreview> {
  return postAuthJson('/campaigns/preview', rules, accessToken);
}

export function createCampaign(input: CreateCampaignInput, accessToken: string): Promise<{ campaign: CampaignRoi['campaign']; queued: number; excludedNoConsent: number; description: string }> {
  return postAuthJson('/campaigns', input, accessToken);
}

export function fetchCampaigns(accessToken: string): Promise<CampaignRoi[]> {
  return getJson('/campaigns', accessToken);
}

export function recordCampaignConversion(campaignId: string, orderId: string, accessToken: string): Promise<CampaignRoi> {
  return postAuthJson(`/campaigns/${campaignId}/conversions`, { orderId }, accessToken);
}
