#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const metadataPath = path.join(repoRoot, 'apps/ios/store/client-metadata.json');

const fail = (message) => {
  console.error(`ios store screenshots: ${message}`);
  process.exit(1);
};

const readJson = (filePath, label) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`could not read ${label}: ${error.message}`);
  }
};

const assertSafeRelativePath = (value, label) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  if (path.isAbsolute(value) || value.split(/[\\/]/u).includes('..')) {
    fail(`${label} must be a safe repository-relative path`);
  }
  return value;
};

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

const parsePng = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    fail(`${path.relative(repoRoot, filePath)} is not a PNG file`);
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail(`${path.relative(repoRoot, filePath)} does not contain a PNG IHDR header`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    fail(`${path.relative(repoRoot, filePath)} has invalid PNG dimensions`);
  }
  return {
    width,
    height,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
  };
};

const stateFromAttachment = (attachment) => {
  const suggested = attachment?.suggestedHumanReadableName;
  if (typeof suggested !== 'string') return null;
  const match = suggested.match(/^(client-[a-z0-9-]+)_/u);
  return match?.[1] ?? null;
};

const metadata = readJson(metadataPath, 'App Store metadata');
const screenshots = metadata.screenshots ?? {};
const source = assertSafeRelativePath(screenshots.source, 'screenshots.source');
const sourceDir = path.join(repoRoot, source);
const sourceManifestPath = path.join(sourceDir, 'manifest.json');
const requiredStates = screenshots.requiredStates;

if (!Array.isArray(requiredStates) || requiredStates.length === 0) {
  fail('screenshots.requiredStates must list the App Store screenshot states');
}
if (screenshots.requiredPngCount !== requiredStates.length) {
  fail('screenshots.requiredPngCount must match screenshots.requiredStates.length');
}
if (!fs.existsSync(sourceDir)) {
  fail(`source directory does not exist: ${source}`);
}
if (!fs.existsSync(sourceManifestPath)) {
  fail(`Xcode attachment manifest is missing: ${path.relative(repoRoot, sourceManifestPath)}`);
}

const sourceManifest = readJson(sourceManifestPath, 'Xcode attachment manifest');
const attachments = sourceManifest.flatMap((entry) => entry?.attachments ?? []);
const byState = new Map();

for (const attachment of attachments) {
  const state = stateFromAttachment(attachment);
  if (!state) continue;
  const fileName = attachment.exportedFileName;
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) {
    fail(`attachment for ${state} has an unsafe exported filename`);
  }
  if (byState.has(state)) {
    fail(`duplicate screenshot attachment for ${state}`);
  }
  byState.set(state, attachment);
}

const missing = requiredStates.filter((state) => !byState.has(state));
if (missing.length > 0) {
  fail(`missing required screenshot state(s): ${missing.join(', ')}`);
}

const unexpected = [...byState.keys()].filter((state) => !requiredStates.includes(state));
if (unexpected.length > 0) {
  fail(`unexpected screenshot state(s): ${unexpected.join(', ')}`);
}

const outputRoot = path.join(repoRoot, 'apps/ios/build/AppStoreScreenshots');
const locale = metadata.app?.primaryLocale ?? 'ru-KG';
const device = slug(screenshots.requiredSimulator ?? 'iphone');
const outputDir = path.join(outputRoot, locale, device);

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const files = requiredStates.map((state, index) => {
  const attachment = byState.get(state);
  const sourcePath = path.join(sourceDir, attachment.exportedFileName);
  if (!fs.existsSync(sourcePath)) {
    fail(`screenshot file for ${state} is missing: ${path.relative(repoRoot, sourcePath)}`);
  }
  const png = parsePng(sourcePath);
  const fileName = `${String(index + 1).padStart(2, '0')}-${state}.png`;
  const outputPath = path.join(outputDir, fileName);
  fs.copyFileSync(sourcePath, outputPath);
  return {
    order: index + 1,
    state,
    file: path.relative(repoRoot, outputPath),
    sourceFile: path.relative(repoRoot, sourcePath),
    suggestedHumanReadableName: attachment.suggestedHumanReadableName,
    width: png.width,
    height: png.height,
    bytes: png.bytes,
    sha256: png.sha256,
  };
});

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  app: {
    name: metadata.app?.name,
    bundleId: metadata.app?.bundleId,
    primaryLocale: locale,
  },
  source: {
    directory: source,
    manifest: path.relative(repoRoot, sourceManifestPath),
    simulator: screenshots.requiredSimulator,
  },
  output: {
    directory: path.relative(repoRoot, outputDir),
    count: files.length,
  },
  files,
};

const manifestPath = path.join(outputDir, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `ios store screenshots: packaged ${files.length} screenshots into ${path.relative(
    repoRoot,
    outputDir,
  )}`,
);
