"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCustomerPaymentMethods = resolveCustomerPaymentMethods;
function resolveCustomerPaymentMethods(provider, env) {
    const online = provider === 'production'
        || (provider === 'sandbox' && env('PAYMENTS_SANDBOX_CONFIRM_ENABLED')?.trim().toLowerCase() === 'true');
    const onlineMethods = ['card', 'qr_mbank', 'qr_odengi', 'installment'];
    return {
        online,
        methods: online ? ['cash', ...onlineMethods] : ['cash'],
    };
}
//# sourceMappingURL=payment-methods-availability.js.map