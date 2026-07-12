#!/usr/bin/env node

const web = required('WEB_BASE_URL').replace(/\/$/, '');
const api = required('API_BASE_URL').replace(/\/$/, '');

await check(`${web}/healthz`, 'web health');
await check(`${api}/api/health/live`, 'api liveness');
await check(`${api}/api/health/ready`, 'api readiness');
await check(`${api}/api/catalog/products?limit=1`, 'catalog');
console.log('Deployment smoke passed.');

async function check(url, label) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${url}`);
  console.log(`${label}: ${response.status}`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
