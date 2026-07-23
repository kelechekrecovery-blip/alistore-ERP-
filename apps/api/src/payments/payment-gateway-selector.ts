import { PaymentGatewayProvider } from './payment-gateway-provider';
import { NonePaymentGatewayProvider } from './none-payment-gateway.provider';
import { ProductionPaymentGatewayProvider } from './production-payment-gateway.provider';
import { SandboxPaymentGatewayProvider } from './sandbox-payment-gateway.provider';

export type PaymentEnvReader = (name: string) => string | undefined;

export function selectPaymentGatewayProvider(env: PaymentEnvReader): PaymentGatewayProvider {
  const mode = env('PAYMENT_PROVIDER')?.trim().toLowerCase();
  if (!mode || mode === 'sandbox') {
    return new SandboxPaymentGatewayProvider(value(env, 'PAYMENTS_SANDBOX_WEBHOOK_SECRET'));
  }
  // Явный отказ от онлайн-оплаты: магазин продаёт за наличные при получении и
  // не нуждается в шлюзе. Ветка стоит до проверки на 'production', потому что
  // это законное состояние, а не неизвестное значение.
  if (mode === 'none') return new NonePaymentGatewayProvider();
  if (mode !== 'production') {
    throw new Error(`Unsupported PAYMENT_PROVIDER: ${mode}`);
  }
  const options = {
    apiUrl: value(env, 'PAYMENT_API_URL'),
    merchantId: value(env, 'PAYMENT_MERCHANT_ID'),
    apiKey: value(env, 'PAYMENT_API_KEY'),
    webhookSecret: value(env, 'PAYMENT_WEBHOOK_SECRET'),
  };
  const missing = Object.entries(options).filter(([, item]) => !item).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Incomplete production payment configuration: ${missing.join(', ')}`);
  }
  return new ProductionPaymentGatewayProvider(options);
}

function value(env: PaymentEnvReader, name: string): string {
  return env(name)?.trim() ?? '';
}
