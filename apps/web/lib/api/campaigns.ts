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
    name: string;
    status: 'draft' | 'review' | 'approved' | 'active' | 'paused' | 'completed';
    trackingCode: string;
    source: string;
    medium: string;
    promotionCode?: string | null;
    segment: string;
    channel: string;
    budget: number;
    creativeType: 'text' | 'image' | 'video';
    creativeHeadline: string;
    creativeBody?: string | null;
    creativeAssetUrl?: string | null;
    creativeCtaLabel?: string | null;
    destinationUrl: string;
    approvalId?: string | null;
    rejectionReason?: string | null;
    orders: number;
    revenue: number;
    grossProfit: number;
  };
  description: string;
  orders: number;
  revenue: number;
  budget: number;
  spend: number;
  profit: number;
  grossProfit: number;
  refundRevenue: number;
  restoredCost: number;
  netRevenue: number;
  netGrossProfit: number;
  contribution: number;
  paidRoas: number | null;
  roas: number | null;
  roiPct: number | null;
  delivery: { pending: number; sent: number; failed: number; cancelled: number };
  funnel: {
    clicks: number;
    visits: number;
    checkouts: number;
    conversions: number;
    conversionRate: number | null;
  };
}

export interface CreateCampaignInput extends SegmentRules {
  name: string;
  channel: 'sms' | 'push' | 'telegram' | 'whatsapp';
  budget: number;
  creativeHeadline: string;
  creativeType?: 'text' | 'image' | 'video';
  creativeBody?: string;
  creativeAssetUrl?: string;
  creativeCtaLabel?: string;
  destinationUrl?: string;
  source?: string;
  medium?: string;
  promotionCode?: string;
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

export function submitCampaign(id: string, accessToken: string): Promise<CampaignRoi['campaign']> {
  return postAuthJson(`/campaigns/${id}/submit`, {}, accessToken);
}

export function activateCampaign(id: string, accessToken: string): Promise<{ campaign: CampaignRoi['campaign']; queued: number }> {
  return postAuthJson(`/campaigns/${id}/activate`, {}, accessToken);
}

export function pauseCampaign(id: string, accessToken: string): Promise<CampaignRoi['campaign']> {
  return postAuthJson(`/campaigns/${id}/pause`, {}, accessToken);
}

export function completeCampaign(id: string, accessToken: string): Promise<CampaignRoi['campaign']> {
  return postAuthJson(`/campaigns/${id}/complete`, {}, accessToken);
}

export function recordCampaignConversion(campaignId: string, orderId: string, accessToken: string): Promise<CampaignRoi> {
  return postAuthJson(`/campaigns/${campaignId}/conversions`, { orderId }, accessToken);
}
