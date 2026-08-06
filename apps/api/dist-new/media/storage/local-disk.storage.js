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
exports.LocalDiskStorage = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
let LocalDiskStorage = class LocalDiskStorage {
    constructor(config) {
        this.dir = config.get('MEDIA_LOCAL_DIR') ?? './uploads';
        this.publicBase = config.get('MEDIA_PUBLIC_BASE') ?? '/uploads';
    }
    async put(key, body, _contentType, signal) {
        const path = (0, node_path_1.join)(this.dir, key);
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(path), { recursive: true });
        await (0, promises_1.writeFile)(path, body, { signal });
        return { key, url: `${this.publicBase}/${key}`, bytes: body.byteLength };
    }
    async delete(key) {
        await (0, promises_1.unlink)((0, node_path_1.join)(this.dir, key)).catch((error) => {
            if (error.code !== 'ENOENT')
                throw error;
        });
    }
    async getReadUrl(key) {
        return `${this.publicBase}/${key}`;
    }
};
exports.LocalDiskStorage = LocalDiskStorage;
exports.LocalDiskStorage = LocalDiskStorage = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LocalDiskStorage);
//# sourceMappingURL=local-disk.storage.js.map