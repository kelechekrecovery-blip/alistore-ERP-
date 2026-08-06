"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalizationModule = void 0;
const common_1 = require("@nestjs/common");
const nestjs_i18n_1 = require("nestjs-i18n");
const in_memory_i18n_loader_1 = require("./in-memory-i18n.loader");
const i18n_demo_controller_1 = require("./i18n-demo.controller");
let LocalizationModule = class LocalizationModule {
};
exports.LocalizationModule = LocalizationModule;
exports.LocalizationModule = LocalizationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            nestjs_i18n_1.I18nModule.forRoot({
                fallbackLanguage: 'ru',
                loaders: [new in_memory_i18n_loader_1.InMemoryI18nLoader()],
                resolvers: [
                    new nestjs_i18n_1.QueryResolver(['lang']),
                    new nestjs_i18n_1.HeaderResolver(['x-lang']),
                    nestjs_i18n_1.AcceptLanguageResolver,
                ],
            }),
        ],
        controllers: [i18n_demo_controller_1.I18nDemoController],
    })
], LocalizationModule);
//# sourceMappingURL=localization.module.js.map