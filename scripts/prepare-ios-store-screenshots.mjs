#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const APP_KEYS = ['client', 'staff', 'courier', 'pos'];

const fail = (message) => {
  console.error(`ios store screenshots: ${message}`);
  process.exit(1);
};

const parseArgs = (argv) => {
  const apps = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') continue;
    if (arg === '--app') {
      const value = argv[index + 1];
      index += 1;
      if (!APP_KEYS.includes(value)) fail(`--app must be one of ${APP_KEYS.join(', ')}`);
      apps.push(value);
      continue;
    }
    if (arg.startsWith('--app=')) {
      const value = arg.slice('--app='.length);
      if (!APP_KEYS.includes(value)) fail(`--app must be one of ${APP_KEYS.join(', ')}`);
      apps.push(value);
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  return apps.length > 0 ? [...new Set(apps)] : APP_KEYS;
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

/**
 * Apple derives every smaller screenshot class from the base upload, so a set captured on the
 * wrong simulator silently degrades the listing. The expected size is declared per device in
 * the metadata; both orientations of that size are accepted, nothing else is.
 */
const readExpectedDimensions = (device, label) => {
  const expected = device?.expectedDimensions;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    fail(`${label}.expectedDimensions must declare the Apple device class {width, height}`);
  }
  const { width, height } = expected;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail(`${label}.expectedDimensions.width/height must be positive integers`);
  }
  return { width, height };
};

const assertDimensions = ({ png, expected, appKey, deviceKey, state, sourcePath }) => {
  const portrait = png.width === expected.width && png.height === expected.height;
  const landscape = png.width === expected.height && png.height === expected.width;
  if (portrait || landscape) return;
  fail(
    `${appKey}/${deviceKey} screenshot for ${state} is ${png.width}x${png.height}, ` +
      `expected the ${expected.width}x${expected.height} device class ` +
      `(or ${expected.height}x${expected.width} in landscape): ` +
      `${path.relative(repoRoot, sourcePath)} — recapture on the simulator declared in metadata`,
  );
};

const packageApp = (appKey) => {
  const metadataPath = path.join(repoRoot, `apps/ios/store/${appKey}-metadata.json`);
  const metadata = readJson(metadataPath, `${appKey} App Store metadata`);
  const screenshots = metadata.screenshots ?? {};
  const requiredStates = screenshots.requiredStates;
  const devices = screenshots.devices;

  if (!Array.isArray(requiredStates) || requiredStates.length === 0) {
    fail(`${appKey}: screenshots.requiredStates must list the App Store screenshot states`);
  }
  if (screenshots.requiredPngCount !== requiredStates.length) {
    fail(`${appKey}: screenshots.requiredPngCount must match screenshots.requiredStates.length`);
  }
  if (!devices || typeof devices !== 'object' || Array.isArray(devices)) {
    fail(`${appKey}: screenshots.devices must define screenshot sources`);
  }

  const outputRoot = path.join(repoRoot, 'apps/ios/build/AppStoreScreenshots');
  const locale = metadata.app?.primaryLocale ?? 'ru-KG';

  for (const [deviceKey, device] of Object.entries(devices)) {
    const label = `${appKey}.screenshots.devices.${deviceKey}`;
    const source = assertSafeRelativePath(device?.source, `${label}.source`);
    const outputSlug = assertSafeRelativePath(device?.outputSlug, `${label}.outputSlug`);
    if (outputSlug.includes('/') || outputSlug.includes('\\')) {
      fail(`${label}.outputSlug must be a single directory name`);
    }
    const expectedDimensions = readExpectedDimensions(device, label);

    const sourceDir = path.join(repoRoot, source);
    const sourceManifestPath = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(sourceDir)) {
      fail(`${appKey}: source directory does not exist: ${source} — run npm run ios:visual first`);
    }
    if (!fs.existsSync(sourceManifestPath)) {
      fail(
        `${appKey}: Xcode attachment manifest is missing: ${path.relative(
          repoRoot,
          sourceManifestPath,
        )}`,
      );
    }

    const sourceManifest = readJson(
      sourceManifestPath,
      `${appKey}/${deviceKey} Xcode attachment manifest`,
    );
    const attachments = sourceManifest.flatMap((entry) => entry?.attachments ?? []);
    const byState = new Map();

    for (const attachment of attachments) {
      const suggested = attachment?.suggestedHumanReadableName;
      if (typeof suggested !== 'string') continue;
      const state = requiredStates.find(
        (candidate) => suggested === candidate || suggested.startsWith(`${candidate}_`),
      );
      if (!state) continue;
      const fileName = attachment.exportedFileName;
      if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) {
        fail(`${appKey}/${deviceKey} attachment for ${state} has an unsafe exported filename`);
      }
      if (byState.has(state)) {
        fail(`duplicate ${appKey}/${deviceKey} screenshot attachment for ${state}`);
      }
      byState.set(state, attachment);
    }

    const missing = requiredStates.filter((state) => !byState.has(state));
    if (missing.length > 0) {
      fail(`missing required ${appKey}/${deviceKey} screenshot state(s): ${missing.join(', ')}`);
    }

    const outputDir = path.join(outputRoot, locale, appKey, outputSlug);
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const files = requiredStates.map((state, index) => {
      const attachment = byState.get(state);
      const sourcePath = path.join(sourceDir, attachment.exportedFileName);
      if (!fs.existsSync(sourcePath)) {
        fail(
          `${appKey}: screenshot file for ${state} is missing: ${path.relative(
            repoRoot,
            sourcePath,
          )}`,
        );
      }
      const png = parsePng(sourcePath);
      assertDimensions({ png, expected: expectedDimensions, appKey, deviceKey, state, sourcePath });
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
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      app: {
        key: appKey,
        name: metadata.app?.name,
        bundleId: metadata.app?.bundleId,
        primaryLocale: locale,
      },
      source: {
        directory: source,
        manifest: path.relative(repoRoot, sourceManifestPath),
        simulator: device.simulator,
        expectedDimensions,
      },
      output: {
        directory: path.relative(repoRoot, outputDir),
        count: files.length,
      },
      files,
    };

    fs.writeFileSync(
      path.join(outputDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    console.log(
      `ios store screenshots (${appKey}/${deviceKey}): packaged ${files.length} screenshots ` +
        `at ${expectedDimensions.width}x${expectedDimensions.height} into ${path.relative(
          repoRoot,
          outputDir,
        )}`,
    );
  }
};

for (const appKey of parseArgs(process.argv.slice(2))) {
  packageApp(appKey);
}
