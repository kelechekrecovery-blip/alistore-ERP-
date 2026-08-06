"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const media_service_1 = require("./media.service");
const media_controller_1 = require("./media.controller");
const local_disk_storage_1 = require("./storage/local-disk.storage");
const s3_storage_1 = require("./storage/s3.storage");
const media_storage_1 = require("./media-storage");
const media_cleanup_service_1 = require("./media-cleanup.service");
const authz_module_1 = require("../authz/authz.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
let MediaModule = class MediaModule {
};
exports.MediaModule = MediaModule;
exports.MediaModule = MediaModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, rate_limit_module_1.RateLimitModule],
        providers: [
            media_service_1.MediaService,
            media_cleanup_service_1.MediaCleanupService,
            {
                provide: media_storage_1.MEDIA_STORAGE,
                inject: [config_1.ConfigService],
                useFactory: (config) => config.get('MEDIA_STORAGE') === 's3'
                    ? new s3_storage_1.S3Storage(config)
                    : new local_disk_storage_1.LocalDiskStorage(config),
            },
        ],
        controllers: [media_controller_1.MediaController],
        exports: [media_service_1.MediaService, media_cleanup_service_1.MediaCleanupService],
    })
], MediaModule);
//# sourceMappingURL=media.module.js.map