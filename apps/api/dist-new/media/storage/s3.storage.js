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
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Storage = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
let S3Storage = class S3Storage {
    constructor(config) {
        const endpoint = config.get('S3_ENDPOINT') ?? 'http://localhost:9000';
        this.bucket = config.get('MINIO_BUCKET') ?? 'alistore';
        this.publicBase =
            config.get('S3_PUBLIC_BASE') ?? `${endpoint}/${this.bucket}`;
        this.evidenceUrlTtl = Math.min(900, Math.max(60, Number(config.get('EVIDENCE_SIGNED_URL_TTL_SECONDS') ?? 300)));
        this.client = new client_s3_1.S3Client({
            endpoint,
            region: config.get('S3_REGION') ?? 'us-east-1',
            forcePathStyle: true,
            credentials: {
                accessKeyId: config.get('MINIO_ROOT_USER') ?? 'alistore',
                secretAccessKey: config.get('MINIO_ROOT_PASSWORD') ?? '',
            },
        });
    }
    async put(key, body, contentType, signal) {
        await this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }), { abortSignal: signal });
        const url = key.startsWith('evidence/')
            ? await this.getReadUrl(key)
            : `${this.publicBase}/${key}`;
        return { key, url, bytes: body.byteLength };
    }
    async delete(key) {
        await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }
    async getReadUrl(key) {
        if (!key.startsWith('evidence/'))
            return `${this.publicBase}/${key}`;
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, new client_s3_1.GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: this.evidenceUrlTtl });
    }
};
exports.S3Storage = S3Storage;
exports.S3Storage = S3Storage = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], S3Storage);
//# sourceMappingURL=s3.storage.js.map