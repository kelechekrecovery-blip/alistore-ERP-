import { healthReady } from '../lib/health.js';

export function onRequestGet(context) {
  return healthReady(context);
}
