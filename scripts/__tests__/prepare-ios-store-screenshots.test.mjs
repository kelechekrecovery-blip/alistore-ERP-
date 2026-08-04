import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prepare-ios-store-screenshots.mjs',
);

const APPLE_IPHONE_6_9 = { width: 1320, height: 2868 };

const crc32Table = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crc32Table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};

// Minimal but structurally valid 8-bit greyscale PNG of the requested size.
const makePng = (width, height) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  const raw = Buffer.alloc((width + 1) * height); // filter byte 0 + zeroed scanline
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const states = ['client-home', 'client-cart'];

/**
 * Builds a throwaway repository root that mirrors what `ios:visual` leaves behind.
 * `pngSize` controls the dimensions of every exported attachment.
 */
const makeFixtureRepo = ({ pngSize, expectedDimensions = APPLE_IPHONE_6_9 }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-store-screenshots-'));
  const source = 'apps/ios/build/AliStoreClientVisual-iphone-attachments';
  const sourceDir = path.join(root, source);
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'apps/ios/store'), { recursive: true });

  const attachments = states.map((state, index) => {
    const exportedFileName = `attachment_${index}.png`;
    fs.writeFileSync(path.join(sourceDir, exportedFileName), makePng(pngSize.width, pngSize.height));
    return { suggestedHumanReadableName: `${state}_1_${index}.png`, exportedFileName };
  });
  fs.writeFileSync(
    path.join(sourceDir, 'manifest.json'),
    `${JSON.stringify([{ attachments }], null, 2)}\n`,
  );

  const iphone = { source, simulator: 'iPhone 17 Pro Max', outputSlug: 'iphone-6-9' };
  // `null` models metadata that forgot to declare the device class at all.
  if (expectedDimensions !== null) iphone.expectedDimensions = expectedDimensions;

  fs.writeFileSync(
    path.join(root, 'apps/ios/store/client-metadata.json'),
    `${JSON.stringify(
      {
        app: { name: 'AliStore KG', bundleId: 'kg.alistore.client', primaryLocale: 'ru-KG' },
        screenshots: {
          requiredPngCount: states.length,
          devices: { iphone },
          requiredStates: states,
        },
      },
      null,
      2,
    )}\n`,
  );

  return root;
};

const runPackager = (root, args = ['--app', 'client']) =>
  spawnSync(process.execPath, [scriptPath, ...args], { cwd: root, encoding: 'utf8' });

test('rejects screenshots whose pixel size is not the expected device class', () => {
  // 1206x2622 is the 6.3" class; Apple wants 6.9" (1320x2868) as the base upload.
  const root = makeFixtureRepo({ pngSize: { width: 1206, height: 2622 } });
  const result = runPackager(root);

  assert.notEqual(result.status, 0, `expected a non-zero exit, got:\n${result.stdout}`);
  const message = `${result.stderr}${result.stdout}`;
  assert.match(message, /1206x2622/u);
  assert.match(message, /1320x2868/u);
  assert.match(message, /client-home/u);
});

test('packages screenshots that match the expected device class', () => {
  const root = makeFixtureRepo({ pngSize: APPLE_IPHONE_6_9 });
  const result = runPackager(root);

  assert.equal(result.status, 0, `expected success, got:\n${result.stderr}`);
  const outputDir = path.join(root, 'apps/ios/build/AppStoreScreenshots/ru-KG/client/iphone-6-9');
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files.length, states.length);
  assert.deepEqual(
    manifest.files.map((file) => file.state),
    states,
  );
  for (const file of manifest.files) {
    assert.equal(file.width, APPLE_IPHONE_6_9.width);
    assert.equal(file.height, APPLE_IPHONE_6_9.height);
  }
  assert.ok(fs.existsSync(path.join(outputDir, '01-client-home.png')));
  assert.ok(fs.existsSync(path.join(outputDir, '02-client-cart.png')));
});

test('rejects metadata that does not declare expectedDimensions', () => {
  const root = makeFixtureRepo({ pngSize: APPLE_IPHONE_6_9, expectedDimensions: null });
  const result = runPackager(root);

  assert.notEqual(result.status, 0, `expected a non-zero exit, got:\n${result.stdout}`);
  assert.match(`${result.stderr}${result.stdout}`, /expectedDimensions/u);
});
