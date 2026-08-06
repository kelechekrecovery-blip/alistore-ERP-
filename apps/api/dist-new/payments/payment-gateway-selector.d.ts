import { PaymentGatewayProvider } from './payment-gateway-provider';
export type PaymentEnvReader = (name: string) => string | undefined;
export declare function selectPaymentGatewayProvider(env: PaymentEnvReader): PaymentGatewayProvider;
