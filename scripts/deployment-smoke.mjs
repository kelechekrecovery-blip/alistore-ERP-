#!/usr/bin/env node

const web = required('WEB_BASE_URL').replace(/\/$/, '');
const api = required('API_BASE_URL').replace(/\/$/, '');

await check(`${web}/healthz`, 'web health');
await checkNoStore(`${web}/checkout`, 'checkout HTML cache policy');
await checkNoStore(`${web}/cart`, 'cart HTML cache policy');
await check(`${api}/api/health/live`, 'api liveness');
await check(`${api}/api/health/ready`, 'api readiness');
await checkCatalogHasProducts(`${api}/api/catalog/products?limit=1`);
const strictAuthConfiguration = process.env.REQUIRE_CUSTOMER_AUTH_CONFIGURATION?.trim() === 'true';
await checkAuthMethods(`${api}/api/auth/methods`, strictAuthConfiguration);
if (strictAuthConfiguration) await checkLoginAuthBundle(`${web}/login`);
console.log('Deployment smoke passed.');

async function check(url, label) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${url}`);
  console.log(`${label}: ${response.status}`);
}

async function checkNoStore(url, label) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${url}`);
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  if (!cacheControl.includes('no-store')) {
    throw new Error(`${label} missing no-store cache policy: ${cacheControl || 'header absent'} (${url})`);
  }
  console.log(`${label}: no-store`);
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

async function checkAuthMethods(url, strict) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`auth methods failed: ${response.status} ${url}`);
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  if (!cacheControl.includes('no-store')) {
    throw new Error(`auth methods missing no-store cache policy: ${cacheControl || 'header absent'} (${url})`);
  }
  const body = await response.json();
  for (const method of ['phone', 'email', 'apple', 'google']) {
    if (typeof body?.[method]?.enabled !== 'boolean' || typeof body?.[method]?.registers !== 'boolean') {
      throw new Error(`auth methods has an invalid ${method} capability shape`);
    }
  }
  if (typeof body?.registrationAvailable !== 'boolean') {
    throw new Error('auth methods has no registrationAvailable boolean');
  }
  if (!strict) {
    console.log(`auth methods: ${response.status}, registration=${body.registrationAvailable}`);
    return;
  }

  const failures = [];
  if (!body.phone.enabled || !body.phone.registers) failures.push('phone login/registration');
  if (!body.email.enabled) failures.push('email login');
  if (!body.recovery?.enabled) failures.push('account recovery');
  if (!body.apple.enabled || !body.apple.registers) failures.push('Apple login/registration');
  if (body.apple.clientId !== 'kg.alistore.web') failures.push('Apple Services ID');
  if (body.apple.redirectUri !== 'https://ali.kg/login') failures.push('Apple redirect URI');
  if (!body.google.enabled || !body.google.registers || !body.google.clientId) {
    failures.push('Google login/registration');
  }
  if (!body.registrationAvailable) failures.push('registrationAvailable');
  if (failures.length) {
    throw new Error(`production auth configuration gate failed: ${failures.join(', ')}`);
  }
  console.log('auth methods: customer login and registration configuration is coherent');
}

async function checkLoginAuthBundle(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`login page failed: ${response.status} ${url}`);
  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/giu)]
    .map((match) => new URL(match[1], url))
    .filter((scriptUrl) => scriptUrl.origin === new URL(url).origin && scriptUrl.pathname.endsWith('.js'));
  if (!scripts.length) throw new Error(`login page exposes no same-origin JavaScript chunks: ${url}`);
  const chunks = await Promise.all(scripts.map(async (scriptUrl) => {
    const chunk = await fetch(scriptUrl, { signal: AbortSignal.timeout(15_000) });
    if (!chunk.ok) throw new Error(`login chunk failed: ${chunk.status} ${scriptUrl}`);
    return chunk.text();
  }));
  const source = chunks.join('\n');
  const officialAppleSdk = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
  if (!source.includes(officialAppleSdk)) {
    throw new Error('login bundle does not load the official Apple Sign in SDK');
  }
  if (!source.includes('authorizationCode')) {
    throw new Error('login bundle does not send the Apple authorization code');
  }
  console.log('login auth bundle: official Apple SDK + authorization-code contract');
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
