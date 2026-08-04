import fs from 'node:fs';
import process from 'node:process';

const file = process.argv[2] ?? 'apps/android/store/data-safety.json';
const fail = (message) => {
  console.error(`android-store-data-safety: ${message}`);
  process.exit(1);
};

let document;
try {
  document = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  fail(`could not parse ${file}: ${error.message}`);
}

if (document.schemaVersion !== 1) fail('schemaVersion must be 1');
if (document.reviewStatus !== 'owner-and-legal-review-required') {
  fail('reviewStatus must keep explicit owner/legal review until submission is approved');
}

const expected = new Set([
  'kg.alistore.client',
  'kg.alistore.staff',
  'kg.alistore.courier',
  'kg.alistore.pos',
]);
if (!Array.isArray(document.apps) || document.apps.length !== expected.size) fail('all four Android applications are required');

for (const app of document.apps) {
  if (!expected.delete(app.applicationId)) fail(`unexpected or duplicate applicationId: ${app.applicationId}`);
  if (!['public', 'managed'].includes(app.distribution)) fail(`${app.applicationId} has invalid distribution`);
  if (!Array.isArray(app.dataTypes) || app.dataTypes.length === 0) fail(`${app.applicationId} needs dataTypes`);
  if (app.security?.encryptedInTransit !== true) fail(`${app.applicationId} must declare encryptedInTransit=true`);
  for (const item of app.dataTypes) {
    if (!item.type || !Array.isArray(item.purpose) || item.purpose.length === 0) fail(`${app.applicationId} has an incomplete data type`);
    if (typeof item.collected !== 'boolean' || typeof item.shared !== 'boolean' || typeof item.optional !== 'boolean') {
      fail(`${app.applicationId} has invalid collection flags`);
    }
  }
}
if (expected.size) fail(`missing applications: ${[...expected].join(', ')}`);
console.log(`android-store-data-safety: validated ${document.apps.length} application declarations`);
