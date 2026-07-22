#!/usr/bin/env node

const web = required('WEB_BASE_URL').replace(/\/$/, '');
const api = required('API_BASE_URL').replace(/\/$/, '');

await check(`${web}/healthz`, 'web health');
await check(`${api}/api/health/live`, 'api liveness');
await check(`${api}/api/health/ready`, 'api readiness');
await checkCatalogHasProducts(`${api}/api/catalog/products?limit=1`);
console.log('Deployment smoke passed.');

async function check(url, label) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${url}`);
  console.log(`${label}: ${response.status}`);
}

// Каталог: мало кода ответа. `{ items: [] }` с 200 — это «магазин поднялся, но
// пуст»: витрина открывается, а покупать нечего. Смоук обязан ловить именно это,
// иначе он подтверждает работоспособность там, где её нет.
async function checkCatalogHasProducts(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`catalog failed: ${response.status} ${url}`);
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error(`catalog returned non-JSON: ${error instanceof Error ? error.message : error}`);
  }
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items) throw new Error(`catalog response has no items array: ${url}`);
  if (items.length === 0) throw new Error(`catalog is empty (0 products) at ${url} — deploy is up but has nothing to sell`);
  console.log(`catalog: ${response.status}, items >= ${items.length}`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
