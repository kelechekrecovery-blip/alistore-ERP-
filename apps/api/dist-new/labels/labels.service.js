"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabelsService = void 0;
const common_1 = require("@nestjs/common");
const bwipjs = __importStar(require("bwip-js"));
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
let LabelsService = class LabelsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async unitLabel(imei) {
        const value = imei.trim();
        const unit = await this.prisma.deviceUnit.findUnique({
            where: { imei: value },
        });
        if (!unit) {
            throw new errors_1.ValidationError('unit_not_found', `IMEI ${value} не найден`);
        }
        const product = await this.prisma.product.findUnique({
            where: { id: unit.productId },
        });
        return {
            imei: value,
            product: product?.name ?? unit.productId,
            status: unit.status,
            svg: this.imeiBarcode(value),
        };
    }
    imeiBarcode(imei) {
        const text = imei.trim();
        if (!text) {
            throw new errors_1.ValidationError('empty_imei', 'IMEI пуст');
        }
        return bwipjs.toSVG({
            bcid: 'code128',
            text,
            scale: 3,
            height: 12,
            includetext: true,
            textxalign: 'center',
        });
    }
    qrLabel(text) {
        const value = text.trim();
        if (!value) {
            throw new errors_1.ValidationError('empty_qr', 'Пустой QR');
        }
        return bwipjs.toSVG({ bcid: 'qrcode', text: value, scale: 4 });
    }
};
exports.LabelsService = LabelsService;
exports.LabelsService = LabelsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LabelsService);
//# sourceMappingURL=labels.service.js.map