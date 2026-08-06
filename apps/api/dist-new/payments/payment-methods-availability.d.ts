import { PaymentMethod } from '@prisma/client';
export type PaymentEnvReader = (name: string) => string | undefined;
export interface CustomerPaymentMethods {
    online: boolean;
    methods: PaymentMethod[];
}
export declare function resolveCustomerPaymentMethods(provider: 'sandbox' | 'production' | 'none', env: PaymentEnvReader): CustomerPaymentMethods;
