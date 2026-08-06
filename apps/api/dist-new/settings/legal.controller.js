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
exports.LegalController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const settings_service_1 = require("./settings.service");
let LegalController = class LegalController {
    constructor(settings) {
        this.settings = settings;
    }
    async offer() {
        const text = await this.settings.text('legal.offer_text');
        return { text, published: text !== '' };
    }
};
exports.LegalController = LegalController;
__decorate([
    (0, common_1.Get)('offer'),
    (0, swagger_1.ApiOperation)({ summary: 'Текст публичной оферты (пусто — не опубликована)' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ text: string, published: boolean }' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LegalController.prototype, "offer", null);
exports.LegalController = LegalController = __decorate([
    (0, common_1.Controller)('legal'),
    __metadata("design:paramtypes", [settings_service_1.SettingsService])
], LegalController);
//# sourceMappingURL=legal.controller.js.map