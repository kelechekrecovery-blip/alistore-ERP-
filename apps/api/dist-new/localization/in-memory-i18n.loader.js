"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryI18nLoader = void 0;
const nestjs_i18n_1 = require("nestjs-i18n");
const translations_1 = require("./translations");
class InMemoryI18nLoader extends nestjs_i18n_1.I18nLoader {
    async languages() {
        return Object.keys(translations_1.TRANSLATIONS);
    }
    async load() {
        return translations_1.TRANSLATIONS;
    }
}
exports.InMemoryI18nLoader = InMemoryI18nLoader;
//# sourceMappingURL=in-memory-i18n.loader.js.map