'use client';

import { useEffect } from 'react';
import { captureAttribution, recordCampaignFunnel } from '@/lib/attribution';

export function AttributionCapture() {
  useEffect(() => {
    const attribution = captureAttribution(window.location);
    const trackingCode = attribution?.last.campaign;
    if (!trackingCode || !attribution.journeyId) return;
    void Promise.all([
      recordCampaignFunnel(trackingCode, attribution.journeyId, 'click'),
      recordCampaignFunnel(trackingCode, attribution.journeyId, 'visit'),
    ]).catch(() => undefined);
  }, []);
  return null;
}
