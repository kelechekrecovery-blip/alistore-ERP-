"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = exports.MEDIA_UPLOAD_TIMEOUT_MS = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const sharp_1 = __importDefault(require("sharp"));
const errors_1 = require("../common/errors");
const media_storage_1 = require("./media-storage");
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 80;
exports.MEDIA_UPLOAD_TIMEOUT_MS = 2 * 60_000;
let MediaService = class MediaService {
    constructor(storage) {
        this.storage = storage;
    }
    createImageKey(prefix = 'media') {
        return `${prefix}/${(0, node_crypto_1.randomUUID)()}.webp`;
    }
    async ingestImage(input, prefix = 'media', objectKey) {
        const prepared = await this.prepareImage(input);
        return this.storePreparedImage(prepared, prefix, objectKey);
    }
    async prepareImage(input) {
        if (!input || input.byteLength === 0) {
            throw new errors_1.ValidationError('empty_upload', 'Пустой файл');
        }
        let output;
        try {
            output = await (0, sharp_1.default)(input)
                .rotate()
                .resize({
                width: MAX_DIMENSION,
                height: MAX_DIMENSION,
                fit: 'inside',
                withoutEnlargement: true,
            })
                .webp({ quality: WEBP_QUALITY })
                .toBuffer({ resolveWithObject: true });
        }
        catch {
            throw new errors_1.ValidationError('not_an_image', 'Файл не является изображением');
        }
        return {
            data: output.data,
            width: output.info.width,
            height: output.info.height,
        };
    }
    async storePreparedImage(prepared, prefix = 'media', objectKey) {
        const key = objectKey ?? this.createImageKey(prefix);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), exports.MEDIA_UPLOAD_TIMEOUT_MS);
        timeout.unref();
        let stored;
        try {
            stored = await this.storage.put(key, prepared.data, 'image/webp', controller.signal);
        }
        finally {
            clearTimeout(timeout);
        }
        return {
            key: stored.key,
            url: stored.url,
            width: prepared.width,
            height: prepared.height,
            bytes: stored.bytes,
            format: 'webp',
        };
    }
    async deleteImage(key) {
        await this.storage.delete(key);
    }
    async getReadUrl(key) {
        return this.storage.getReadUrl(key);
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(media_storage_1.MEDIA_STORAGE)),
    __metadata("design:paramtypes", [Object])
], MediaService);
//# sourceMappingURL=media.service.js.map