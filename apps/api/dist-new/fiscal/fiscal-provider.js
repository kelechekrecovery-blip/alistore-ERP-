"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INFORMATIONAL_FISCAL_PROVIDER = void 0;
exports.INFORMATIONAL_FISCAL_PROVIDER = {
    name: 'informational',
    certified: false,
    async issue() {
        return {
            status: 'informational',
            fiscalNumber: null,
            qrPayload: null,
            providerReference: null,
        };
    },
};
//# sourceMappingURL=fiscal-provider.js.map