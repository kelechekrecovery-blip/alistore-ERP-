import { UnprocessableEntityException } from '@nestjs/common';

export const FeatureFlagKey = {
  ToOrderCheckout: 'supply.to_order_checkout',
  Cancellation: 'supply.cancellation',
  AutoRefund: 'supply.auto_refund',
  OwnerResolution: 'supply.owner_resolution',
  PartialHandover: 'supply.partial_handover',
  QuarantineConversion: 'supply.quarantine_conversion',
} as const;

export type FeatureFlagKey = (typeof FeatureFlagKey)[keyof typeof FeatureFlagKey];

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  description: string;
  owner: string;
  defaultEnabled: false;
  legacyEnv: string;
}

export const FEATURE_FLAGS = [
  {
    key: FeatureFlagKey.ToOrderCheckout,
    description: 'Allow checkout for products fulfilled through the to-order supply flow.',
    owner: 'commerce',
    defaultEnabled: false,
    legacyEnv: 'TO_ORDER_CHECKOUT_ENABLED',
  },
  {
    key: FeatureFlagKey.Cancellation,
    description: 'Allow cancellation requests for orders with supplier-backed lines.',
    owner: 'supply',
    defaultEnabled: false,
    legacyEnv: 'SUPPLY_CANCELLATION_ENABLED',
  },
  {
    key: FeatureFlagKey.AutoRefund,
    description: 'Automatically queue eligible supply cancellation refunds.',
    owner: 'finance',
    defaultEnabled: false,
    legacyEnv: 'SUPPLY_AUTO_REFUND_ENABLED',
  },
  {
    key: FeatureFlagKey.OwnerResolution,
    description: 'Allow owner resolution of supply cancellation exceptions.',
    owner: 'supply',
    defaultEnabled: false,
    legacyEnv: 'SUPPLY_OWNER_RESOLUTION_ENABLED',
  },
  {
    key: FeatureFlagKey.PartialHandover,
    description: 'Allow partial handover and reservation of mixed supply orders.',
    owner: 'supply',
    defaultEnabled: false,
    legacyEnv: 'SUPPLY_PARTIAL_HANDOVER_ENABLED',
  },
  {
    key: FeatureFlagKey.QuarantineConversion,
    description: 'Allow conversion of quarantined supply receipts into owned inventory.',
    owner: 'inventory',
    defaultEnabled: false,
    legacyEnv: 'SUPPLY_QUARANTINE_CONVERSION_ENABLED',
  },
] as const satisfies readonly FeatureFlagDefinition[];

export const FEATURE_FLAG_KEYS = FEATURE_FLAGS.map(({ key }) => key);

const DEFINITIONS = new Map<FeatureFlagKey, FeatureFlagDefinition>(
  FEATURE_FLAGS.map((definition) => [definition.key, definition]),
);

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return DEFINITIONS.has(key as FeatureFlagKey);
}

export function featureFlagDefinition(key: string): FeatureFlagDefinition {
  const definition = DEFINITIONS.get(key as FeatureFlagKey);
  if (!definition) {
    throw new UnprocessableEntityException(`Unknown feature flag: ${key}`);
  }
  return definition;
}
