#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const appKeys = ['staff', 'courier', 'pos'];

const fail = (message) => {
  console.error(`ios ecosystem screenshots: ${message}`);
  process.exit(1);
};

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`could not read ${path.relative(repoRoot, filePath)}: ${error.message}`);
  }
};

const safeRelative = (value, label) => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/u).includes('..')
  ) {
    fail(`${label} must be a safe repository-relative path`);
  }
  return value;
};

const parsePng = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (
    buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    fail(`${path.relative(repoRoot, filePath)} is not a valid PNG`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
};

for (const appKey of appKeys) {
  const metadataPath = path.join(repoRoot, `apps/ios/store/${appKey}-metadata.json`);
  const metadata = readJson(metadataPath);
  const requiredStates = metadata.screenshots?.requiredStates;

  if (
    !Array.isArray(requiredStates) ||
    requiredStates.length === 0 ||
    metadata.screenshots.requiredPngCount !== requiredStates.length
  ) {
    fail(`${appKey} metadata has inconsistent screenshot requirements`);
  }

  for (const [deviceKey, device] of Object.entries(metadata.screenshots.devices ?? {})) {
    const source = safeRelative(device.source, `${appKey}.${deviceKey}.source`);
    const outputSlug = safeRelative(device.outputSlug, `${appKey}.${deviceKey}.outputSlug`);
    if (outputSlug.includes('/') || outputSlug.includes('\\')) {
      fail(`${appKey}.${deviceKey}.outputSlug must be a single directory name`);
    }

    const sourceDir = path.join(repoRoot, source);
    const sourceManifestPath = path.join(sourceDir, 'manifest.json');
    const sourceManifest = readJson(sourceManifestPath);
    const attachments = sourceManifest.flatMap((entry) => entry?.attachments ?? []);
    const byState = new Map();

    for (const attachment of attachments) {
      const suggested = attachment?.suggestedHumanReadableName;
      if (typeof suggested !== 'string') continue;
      const state = requiredStates.find(
        (candidate) => suggested === candidate || suggested.startsWith(`${candidate}_`),
      );
      if (!state) continue;
      if (byState.has(state)) fail(`duplicate ${appKey}/${deviceKey} screenshot for ${state}`);
      byState.set(state, attachment);
    }

    const missing = requiredStates.filter((state) => !byState.has(state));
    if (missing.length > 0) {
      fail(`missing ${appKey}/${deviceKey} screenshot state(s): ${missing.join(', ')}`);
    }

    const outputDir = path.join(
      repoRoot,
      'apps/ios/build/AppStoreScreenshots',
      metadata.app.primaryLocale,
      appKey,
      outputSlug,
    );
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const files = requiredStates.map((state, index) => {
      const attachment = byState.get(state);
      if (
        typeof attachment.exportedFileName !== 'string' ||
        path.basename(attachment.exportedFileName) !== attachment.exportedFileName
      ) {
        fail(`${appKey}/${deviceKey} attachment for ${state} has an unsafe filename`);
      }
      const sourcePath = path.join(sourceDir, attachment.exportedFileName);
      const png = parsePng(sourcePath);
      const fileName = `${String(index + 1).padStart(2, '0')}-${state}.png`;
      const outputPath = path.join(outputDir, fileName);
      fs.copyFileSync(sourcePath, outputPath);
      return {
        order: index + 1,
        state,
        file: path.relative(repoRoot, outputPath),
        width: png.width,
        height: png.height,
        bytes: png.bytes,
        sha256: png.sha256,
      };
    });

    fs.writeFileSync(
      path.join(outputDir, 'manifest.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          app: metadata.app,
          source: {
            directory: source,
            simulator: device.simulator,
          },
          output: {
            directory: path.relative(repoRoot, outputDir),
            count: files.length,
          },
          files,
        },
        null,
        2,
      )}\n`,
    );

    console.log(
      `ios ecosystem screenshots (${appKey}/${deviceKey}): packaged ${files.length} screenshots`,
    );
  }
}
