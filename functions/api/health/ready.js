import { healthReady } from '../../../functions/lib/health.js';

export function onRequestGet(context) {
  return healthReady(context);
}
