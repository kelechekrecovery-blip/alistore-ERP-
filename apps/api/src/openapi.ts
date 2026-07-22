import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { RuntimeEnvReader } from './config/runtime-security';

const description = [
  'AliStore MVP backend contract.',
  'The core invariant is Event Ledger first: mutations that change orders, stock,',
  'or money must write audit events atomically in the same transaction.',
].join(' ');

export function shouldExposeOpenApi(env: RuntimeEnvReader = (name) => process.env[name]): boolean {
  if (env('API_DOCS_ENABLED')?.trim().toLowerCase() === 'false') return false;
  return env('NODE_ENV') !== 'production';
}

export function setupOpenApi(app: INestApplication, enabled = shouldExposeOpenApi()): void {
  if (!enabled) return;
  const config = new DocumentBuilder()
    .setTitle('AliStore API')
    .setDescription(description)
    .setVersion('0.1.0')
    .addServer('/api', 'Global API prefix')
    .addTag('catalog', 'Storefront catalog search and Meilisearch indexing')
    .addTag('orders', 'Order lifecycle, reservation, and state transitions')
    .addTag('payments', 'Payments, payment ledger, and txnId idempotency')
    .addTag('notifications', 'Native push token registration and delivery readiness')
    .addTag('tradeins', 'Used-device buyback assessment, contracts, and audit events')
    .addTag('evidence', 'Evidence Vault image uploads linked to Event Ledger')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: {
      operationsSorter: 'alpha',
      persistAuthorization: true,
      tagsSorter: 'alpha',
    },
  });
}
