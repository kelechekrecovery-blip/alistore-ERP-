#!/usr/bin/env node
import fs from 'node:fs';

const [metadataPath] = process.argv.slice(2);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!metadataPath) fail('Usage: validate-ios-store-metadata.mjs <metadata.json>');

let metadata;
try {
  metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
} catch (error) {
  fail(`Could not parse metadata JSON: ${error.message}`);
}

const assertString = (value, path, { min = 1, max = Infinity } = {}) => {
  if (typeof value !== 'string') fail(`${path} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min) fail(`${path} is too short`);
  if (trimmed.length > max) fail(`${path} is too long`);
  if (/XXXXXXXX|TODO|TBD|placeholder|example\.com/iu.test(trimmed)) {
    fail(`${path} contains placeholder text`);
  }
  return trimmed;
};

const assertHttpsUrl = (value, path) => {
  const url = assertString(value, path);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(`${path} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') fail(`${path} must use HTTPS`);
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|staging|sandbox|dev/iu.test(parsed.hostname)) {
    fail(`${path} must not point to local, staging, sandbox or development hosts`);
  }
  return parsed;
};

if (metadata.schemaVersion !== 1) fail('schemaVersion must be 1');
if (metadata.app?.bundleId !== 'kg.alistore.client') fail('app.bundleId must be kg.alistore.client');
if (metadata.app?.name !== 'AliStore') fail('app.name must be AliStore');
assertString(metadata.app?.primaryLocale, 'app.primaryLocale', { min: 2, max: 10 });
assertString(metadata.app?.category, 'app.category', { min: 2, max: 40 });

assertHttpsUrl(metadata.urls?.marketing, 'urls.marketing');
assertHttpsUrl(metadata.urls?.support, 'urls.support');
assertHttpsUrl(metadata.urls?.privacy, 'urls.privacy');

const ru = metadata.localizations?.['ru-KG'];
assertString(ru?.name, 'localizations.ru-KG.name', { min: 2, max: 30 });
assertString(ru?.subtitle, 'localizations.ru-KG.subtitle', { min: 2, max: 30 });
assertString(ru?.promotionalText, 'localizations.ru-KG.promotionalText', { min: 10, max: 170 });
assertString(ru?.description, 'localizations.ru-KG.description', { min: 80, max: 4000 });
if (!Array.isArray(ru?.keywords) || ru.keywords.length < 3) {
  fail('localizations.ru-KG.keywords must list at least three terms');
}
const keywords = ru.keywords.map((keyword, index) =>
  assertString(keyword, `localizations.ru-KG.keywords[${index}]`, { min: 2, max: 30 }),
);
if (keywords.join(',').length > 100) fail('localizations.ru-KG.keywords exceeds App Store keyword length');

if (metadata.review?.demoAccountRequired !== true) fail('review.demoAccountRequired must be true');
assertString(metadata.review?.demoAccountReference, 'review.demoAccountReference', { min: 30, max: 200 });
assertString(metadata.review?.notes, 'review.notes', { min: 80, max: 4000 });
if (/password|парол|token|secret|sk-|cfat_/iu.test(metadata.review.notes)) {
  fail('review.notes must not contain secrets or credentials');
}

if (metadata.screenshots?.requiredSimulator !== 'iPhone 17 Pro') {
  fail('screenshots.requiredSimulator must be iPhone 17 Pro');
}
if (metadata.screenshots?.requiredPngCount !== 17) fail('screenshots.requiredPngCount must be 17');
const requiredStates = metadata.screenshots?.requiredStates;
if (!Array.isArray(requiredStates) || requiredStates.length !== 17) {
  fail('screenshots.requiredStates must contain exactly 17 states');
}
if (new Set(requiredStates).size !== requiredStates.length) {
  fail('screenshots.requiredStates must not contain duplicates');
}
for (const state of requiredStates) assertString(state, 'screenshots.requiredStates[]', { min: 3, max: 80 });

if (metadata.privacy?.tracking !== false) fail('privacy.tracking must be false');
if (metadata.privacy?.dataSafetyReviewRequired !== true) {
  fail('privacy.dataSafetyReviewRequired must be true');
}
assertString(metadata.privacy?.faceIdPurpose, 'privacy.faceIdPurpose', { min: 10, max: 120 });
