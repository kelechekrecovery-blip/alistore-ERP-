import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const read = (relative) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative} is missing`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
};
const requireText = (relative, text) => {
  if (!read(relative).includes(text)) failures.push(`${relative} must contain ${JSON.stringify(text)}`);
};

requireText('apps/web/app/.well-known/apple-app-site-association/route.ts', 'APPLE_TEAM_ID');
requireText('apps/web/app/.well-known/apple-app-site-association/route.ts', 'kg.alistore.client');
requireText('apps/web/app/.well-known/assetlinks.json/route.ts', 'ANDROID_APP_LINK_SHA256');
for (const packageName of ['kg.alistore.client', 'kg.alistore.staff', 'kg.alistore.courier', 'kg.alistore.pos']) {
  requireText('apps/web/app/.well-known/assetlinks.json/route.ts', packageName);
}

for (const host of ['alistore.kg', 'www.alistore.kg']) {
  requireText('apps/api/src/payments/sandbox-payments.controller.ts', host);
  requireText('apps/ios/Client/Client.entitlements', `applinks:${host}`);
  requireText('apps/android/app/src/main/AndroidManifest.xml', `android:host="${host}"`);
}
requireText('apps/api/src/payments/sandbox-payments.controller.ts', "url.pathname === '/payment-return'");
requireText('apps/android/app/src/main/AndroidManifest.xml', 'android:autoVerify="true"');
requireText('apps/android/core/src/main/java/kg/alistore/core/ClientPaymentReturn.kt', 'isHttpsAppLink');
requireText('apps/ios/Client/AliStoreClientApp.swift', 'httpsLink');
requireText('apps/ios/project.yml', 'PAYMENT_RETURN_URL: https://alistore.kg/payment-return');
requireText('apps/android/app/build.gradle.kts', 'PAYMENT_RETURN_URL');

if (failures.length) {
  console.error(`deeplink-preflight: ${failures.length} failure(s)`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('deeplink-preflight: API/Web/iOS/Android contract is structurally consistent');
