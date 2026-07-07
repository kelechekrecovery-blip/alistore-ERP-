// Barrel: the API client is split by domain under lib/api/*. This file re-exports
// everything so `@/lib/api` importers keep working unchanged.
export * from './api/http';
export * from './api/catalog';
export * from './api/orders';
export * from './api/auth';
export * from './api/pos';
export * from './api/warehouse';
export * from './api/exchanges';
export * from './api/approvals';
export * from './api/tradeins';
export * from './api/support';
export * from './api/returns';
export * from './api/evidence';
export * from './api/payments';
