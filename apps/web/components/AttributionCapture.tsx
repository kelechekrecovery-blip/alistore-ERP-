'use client';

import { useEffect } from 'react';
import { captureAttribution } from '@/lib/attribution';

export function AttributionCapture() {
  useEffect(() => {
    captureAttribution(window.location);
  }, []);
  return null;
}
