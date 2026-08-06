"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePhotoImages = resolvePhotoImages;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const sharp_1 = __importDefault(require("sharp"));
const MAX_PHOTOS = 6;
const MAX_EDGE_PX = 1568;
const FETCH_TIMEOUT_MS = 8_000;
async function resolvePhotoImages(photos, opts = {}) {
    const localDir = opts.localDir ?? process.env.MEDIA_LOCAL_DIR ?? './uploads';
    const publicBase = opts.publicBase ?? process.env.MEDIA_PUBLIC_BASE ?? '/uploads';
    const withUrl = photos.filter((p) => typeof p.url === 'string' && p.url.trim().length > 0).slice(0, MAX_PHOTOS);
    const settled = await Promise.all(withUrl.map(async (p) => {
        try {
            const bytes = await loadBytes(p.url, localDir, publicBase);
            if (!bytes)
                return null;
            const jpeg = await (0, sharp_1.default)(bytes)
                .rotate()
                .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();
            return { type: 'image', mediaType: 'image/jpeg', dataBase64: jpeg.toString('base64'), label: p.label };
        }
        catch {
            return null;
        }
    }));
    return settled.filter((x) => x !== null);
}
async function loadBytes(url, localDir, publicBase) {
    if (/^https?:\/\//i.test(url)) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok)
                return null;
            return Buffer.from(await res.arrayBuffer());
        }
        finally {
            clearTimeout(timer);
        }
    }
    const rel = url.startsWith(publicBase) ? url.slice(publicBase.length) : url;
    const safeRel = node_path_1.default.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const abs = node_path_1.default.resolve(localDir, safeRel);
    if (!abs.startsWith(node_path_1.default.resolve(localDir)))
        return null;
    return (0, promises_1.readFile)(abs);
}
//# sourceMappingURL=image-resolver.js.map