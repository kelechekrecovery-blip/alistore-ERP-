#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const expectedApps = [
  ['staff-metadata.json', 'AliStore Staff', 'kg.alistore.staff'],
  ['courier-metadata.json', 'AliStore Courier', 'kg.alistore.courier'],
  ['pos-metadata.json', 'AliStore POS', 'kg.alistore.pos'],
];

const fail = (file, message) => {
  console.error(`ios ecosystem metadata (${file}): ${message}`);
  process.exitCode = 1;
};

const text = (file, value, label, { min = 1, max = Infinity } = {}) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    fail(file, `${label} must contain ${min}-${max} characters`);
    return '';
  }
  if (/XXXXXXXX|TODO|TBD|placeholder|example\.com/iu.test(value)) {
    fail(file, `${label} contains placeholder text`);
  }
  return value.trim();
};

const url = (file, value, label) => {
  const raw = text(file, value, label);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || /localhost|127\.0\.0\.1|staging|sandbox|dev/iu.test(parsed.hostname)) {
      fail(file, `${label} must be a production HTTPS URL`);
    }
  } catch {
    fail(file, `${label} must be a valid URL`);
  }
};

for (const [file, expectedName, expectedBundleId] of expectedApps) {
  const metadataPath = path.join(repoRoot, 'apps/ios/store', file);
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    fail(file, `could not parse JSON: ${error.message}`);
    continue;
  }

  if (metadata.schemaVersion !== 1) fail(file, 'schemaVersion must be 1');
  if (metadata.app?.name !== expectedName) fail(file, `app.name must be ${expectedName}`);
  if (metadata.app?.bundleId !== expectedBundleId) {
    fail(file, `app.bundleId must be ${expectedBundleId}`);
  }
  if (metadata.app?.primaryLocale !== 'ru-KG') fail(file, 'app.primaryLocale must be ru-KG');
  if (metadata.app?.category !== 'BUSINESS') fail(file, 'app.category must be BUSINESS');

  url(file, metadata.urls?.marketing, 'urls.marketing');
  url(file, metadata.urls?.support, 'urls.support');
  url(file, metadata.urls?.privacy, 'urls.privacy');

  const ru = metadata.localizations?.['ru-KG'];
  text(file, ru?.name, 'localizations.ru-KG.name', { min: 2, max: 30 });
  text(file, ru?.subtitle, 'localizations.ru-KG.subtitle', { min: 2, max: 30 });
  text(file, ru?.promotionalText, 'localizations.ru-KG.promotionalText', {
    min: 10,
    max: 170,
  });
  text(file, ru?.description, 'localizations.ru-KG.description', { min: 80, max: 4000 });
  if (!Array.isArray(ru?.keywords) || ru.keywords.length < 3) {
    fail(file, 'localizations.ru-KG.keywords must contain at least three terms');
  } else {
    const keywords = ru.keywords.map((keyword, index) =>
      text(file, keyword, `localizations.ru-KG.keywords[${index}]`, { min: 2, max: 30 }),
    );
    if (keywords.join(',').length > 100) {
      fail(file, 'localizations.ru-KG.keywords exceeds 100 characters');
    }
  }

  if (metadata.review?.demoAccountRequired !== true) {
    fail(file, 'review.demoAccountRequired must be true');
  }
  text(file, metadata.review?.demoAccountReference, 'review.demoAccountReference', {
    min: 30,
    max: 200,
  });
  const notes = text(file, metadata.review?.notes, 'review.notes', { min: 80, max: 4000 });
  if (/password|парол|token|secret|sk-|cfat_/iu.test(notes)) {
    fail(file, 'review.notes must not contain credentials');
  }

  const screenshots = metadata.screenshots;
  if (!Array.isArray(screenshots?.requiredStates) || screenshots.requiredStates.length === 0) {
    fail(file, 'screenshots.requiredStates must not be empty');
  } else if (screenshots.requiredPngCount !== screenshots.requiredStates.length) {
    fail(file, 'screenshots.requiredPngCount must match requiredStates.length');
  } else if (new Set(screenshots.requiredStates).size !== screenshots.requiredStates.length) {
    fail(file, 'screenshots.requiredStates must not contain duplicates');
  }

  for (const [device, simulator, outputSlug] of [
    ['iphone', 'iPhone 17 Pro', 'iphone-17-pro'],
    ['ipad', 'iPad Pro 11-inch (M5)', 'ipad-pro-11'],
  ]) {
    const config = screenshots?.devices?.[device];
    text(file, config?.source, `screenshots.devices.${device}.source`, { min: 10, max: 200 });
    if (config?.simulator !== simulator) {
      fail(file, `screenshots.devices.${device}.simulator must be ${simulator}`);
    }
    if (config?.outputSlug !== outputSlug) {
      fail(file, `screenshots.devices.${device}.outputSlug must be ${outputSlug}`);
    }
  }

  if (metadata.privacy?.tracking !== false) fail(file, 'privacy.tracking must be false');
  if (metadata.privacy?.dataSafetyReviewRequired !== true) {
    fail(file, 'privacy.dataSafetyReviewRequired must be true');
  }
  text(file, metadata.privacy?.faceIdPurpose, 'privacy.faceIdPurpose', { min: 10, max: 120 });

  if (!process.exitCode) console.log(`ios ecosystem metadata (${file}): valid`);
}
