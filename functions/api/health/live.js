import { healthLive } from '../../../functions/lib/health.js';

export function onRequestGet(context) {
  return healthLive(context);
}
