#!/usr/bin/env node
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'assets');
mkdirSync(outDir, { recursive: true });

writePng(join(outDir, 'icon.png'), makeIcon(1024, false));
writePng(join(outDir, 'adaptive-icon.png'), makeIcon(1024, true));
writePng(join(outDir, 'splash.png'), makeSplash(1290, 2796));
writePng(join(outDir, 'favicon.png'), makeIcon(96, false));

console.log(`Generated store assets in ${outDir}`);

function makeIcon(size, transparent) {
  const image = createImage(size, size, transparent ? [0, 0, 0, 0] : [14, 12, 10, 255]);
  if (!transparent) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x - size * 0.2) / size;
        const dy = (y - size * 0.1) / size;
        const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.2);
        blendPixel(image, x, y, [50, 42, 35, Math.round(glow * 180)]);
      }
    }
  }
  const mark = Math.round(size * 0.62);
  drawRoundedRect(image, Math.round((size - mark) / 2), Math.round((size - mark) / 2), mark, mark, Math.round(mark * 0.24), [255, 91, 46, 255]);
  drawA(image, size / 2, size / 2 + mark * 0.06, mark * 0.58, [255, 255, 255, 255]);
  return image;
}

function makeSplash(width, height) {
  const image = createImage(width, height, [14, 12, 10, 255]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - width * 0.5) / width;
      const dy = (y - height * 0.42) / height;
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 3);
      blendPixel(image, x, y, [46, 40, 34, Math.round(glow * 165)]);
    }
  }
  const mark = Math.round(width * 0.34);
  drawRoundedRect(image, Math.round((width - mark) / 2), Math.round(height * 0.39), mark, mark, Math.round(mark * 0.24), [255, 91, 46, 255]);
  drawA(image, width / 2, height * 0.39 + mark * 0.56, mark * 0.58, [255, 255, 255, 255]);
  return image;
}

function createImage(width, height, color) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
  return { width, height, data };
}

function drawA(image, cx, cy, size, color) {
  const half = size / 2;
  const top = cy - half;
  const bottom = cy + half * 0.78;
  const left = cx - half * 0.72;
  const right = cx + half * 0.72;
  const thickness = Math.max(18, size * 0.13);
  drawThickLine(image, left, bottom, cx, top, thickness, color);
  drawThickLine(image, right, bottom, cx, top, thickness, color);
  drawThickLine(image, cx - half * 0.34, cy + half * 0.12, cx + half * 0.34, cy + half * 0.12, thickness * 0.78, color);
}

function drawThickLine(image, x1, y1, x2, y2, thickness, color) {
  const minX = Math.floor(Math.min(x1, x2) - thickness);
  const maxX = Math.ceil(Math.max(x1, x2) + thickness);
  const minY = Math.floor(Math.min(y1, y2) - thickness);
  const maxY = Math.ceil(Math.max(y1, y2) + thickness);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const radius = thickness / 2;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      if (Math.hypot(x - px, y - py) <= radius) setPixel(image, x, y, color);
    }
  }
}

function drawRoundedRect(image, x, y, width, height, r, color) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      const cx = xx < x + r ? x + r : xx >= x + width - r ? x + width - r - 1 : xx;
      const cy = yy < y + r ? y + r : yy >= y + height - r ? y + height - r - 1 : yy;
      if (Math.hypot(xx - cx, yy - cy) <= r || (xx >= x + r && xx < x + width - r) || (yy >= y + r && yy < y + height - r)) {
        setPixel(image, xx, yy, color);
      }
    }
  }
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  image.data[i] = color[0];
  image.data[i + 1] = color[1];
  image.data[i + 2] = color[2];
  image.data[i + 3] = color[3];
}

function blendPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  const a = color[3] / 255;
  image.data[i] = Math.round(color[0] * a + image.data[i] * (1 - a));
  image.data[i + 1] = Math.round(color[1] * a + image.data[i + 1] * (1 - a));
  image.data[i + 2] = Math.round(color[2] * a + image.data[i + 2] * (1 - a));
  image.data[i + 3] = Math.max(image.data[i + 3], color[3]);
}

function writePng(path, image) {
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowStart = y * (image.width * 4 + 1);
    raw[rowStart] = 0;
    image.data.copy(raw, rowStart + 1, y * image.width * 4, (y + 1) * image.width * 4);
  }

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr(image.width, image.height)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
