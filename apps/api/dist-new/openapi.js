"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldExposeOpenApi = shouldExposeOpenApi;
exports.setupOpenApi = setupOpenApi;
const swagger_1 = require("@nestjs/swagger");
const description = [
    'AliStore MVP backend contract.',
    'The core invariant is Event Ledger first: mutations that change orders, stock,',
    'or money must write audit events atomically in the same transaction.',
].join(' ');
function shouldExposeOpenApi(env = (name) => process.env[name]) {
    if (env('API_DOCS_ENABLED')?.trim().toLowerCase() === 'false')
        return false;
    return env('NODE_ENV') !== 'production';
}
function setupOpenApi(app, enabled = shouldExposeOpenApi()) {
    if (!enabled)
        return;
    const config = new swagger_1.DocumentBuilder()
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
    const document = swagger_1.SwaggerModule.createDocument(app, config, {
        operationIdFactory: (controllerKey, methodKey) => `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    });
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
        jsonDocumentUrl: 'api/docs-json',
        swaggerOptions: {
            operationsSorter: 'alpha',
            persistAuthorization: true,
            tagsSorter: 'alpha',
        },
    });
}
//# sourceMappingURL=openapi.js.map