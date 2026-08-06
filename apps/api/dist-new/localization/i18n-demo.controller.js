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
Object.defineProperty(exports, "__esModule", { value: true });
exports.I18nDemoController = void 0;
const common_1 = require("@nestjs/common");
const nestjs_i18n_1 = require("nestjs-i18n");
let I18nDemoController = class I18nDemoController {
    constructor(i18n) {
        this.i18n = i18n;
    }
    greeting(lang) {
        return {
            lang: lang ?? 'ru',
            message: this.i18n.translate('common.greeting', { lang: lang ?? 'ru' }),
        };
    }
};
exports.I18nDemoController = I18nDemoController;
__decorate([
    (0, common_1.Get)('greeting'),
    __param(0, (0, common_1.Query)('lang')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], I18nDemoController.prototype, "greeting", null);
exports.I18nDemoController = I18nDemoController = __decorate([
    (0, common_1.Controller)('i18n'),
    __metadata("design:paramtypes", [nestjs_i18n_1.I18nService])
], I18nDemoController);
//# sourceMappingURL=i18n-demo.controller.js.map