import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { PrismaService } from '../prisma/prisma.service';
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  type FeatureFlagDefinition,
  type FeatureFlagKey,
  featureFlagDefinition,
  isFeatureFlagKey,
} from './feature-flags.registry';

export type FeatureFlagSource = 'database' | 'environment' | 'default';

export interface FeatureFlagState extends FeatureFlagDefinition {
  enabled: boolean;
  source: FeatureFlagSource;
}

interface StoredOverride {
  key: string;
  enabled: boolean;
}

interface EvaluatedValue {
  enabled: boolean;
  source: FeatureFlagSource;
}

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** Unknown runtime keys are deliberately false and never reach the database. */
  async isEnabled(key: FeatureFlagKey | string): Promise<boolean> {
    if (!isFeatureFlagKey(key)) return false;
    const definition = featureFlagDefinition(key);
    const row = await this.prisma.featureFlagOverride.findUnique({ where: { key } });
    return this.evaluate(definition, row).enabled;
  }

  /** Registry order is stable, and raw environment values never enter the result. */
  async list(): Promise<FeatureFlagState[]> {
    const rows = await this.prisma.featureFlagOverride.findMany({
      where: { key: { in: [...FEATURE_FLAG_KEYS] } },
    });
    const stored = new Map(rows.map((row) => [row.key, row]));
    return FEATURE_FLAGS.map((definition) => this.state(definition, stored.get(definition.key)));
  }

  async set(key: string, enabled: boolean, reason: string, actor: string): Promise<FeatureFlagState> {
    const definition = featureFlagDefinition(key);
    const normalizedReason = this.requireReason(reason);

    return this.audit.transaction(async (tx) => {
      const existing = await tx.featureFlagOverride.findUnique({ where: { key: definition.key } });
      const before = this.evaluate(definition, existing);
      await tx.featureFlagOverride.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          enabled,
          reason: normalizedReason,
          updatedBy: actor,
        },
        update: {
          enabled,
          reason: normalizedReason,
          updatedBy: actor,
        },
      });
      const after: EvaluatedValue = { enabled, source: 'database' };
      return {
        result: { ...definition, ...after },
        events: [this.changedEvent(definition.key, normalizedReason, before, after, actor)],
      };
    });
  }

  async reset(key: string, reason: string, actor: string): Promise<FeatureFlagState> {
    const definition = featureFlagDefinition(key);
    const normalizedReason = this.requireReason(reason);

    return this.audit.transaction(async (tx) => {
      const existing = await tx.featureFlagOverride.findUnique({ where: { key: definition.key } });
      const before = this.evaluate(definition, existing);
      await tx.featureFlagOverride.deleteMany({ where: { key: definition.key } });
      const after = this.evaluate(definition);
      return {
        result: { ...definition, ...after },
        events: [this.changedEvent(definition.key, normalizedReason, before, after, actor)],
      };
    });
  }

  private state(definition: FeatureFlagDefinition, row?: StoredOverride): FeatureFlagState {
    return { ...definition, ...this.evaluate(definition, row) };
  }

  private evaluate(definition: FeatureFlagDefinition, row?: StoredOverride | null): EvaluatedValue {
    if (row) return { enabled: row.enabled, source: 'database' };
    const rawEnvironmentValue = this.config.get<unknown>(definition.legacyEnv);
    if (rawEnvironmentValue !== undefined) {
      return {
        enabled: String(rawEnvironmentValue).trim().toLowerCase() === 'true',
        source: 'environment',
      };
    }
    return { enabled: definition.defaultEnabled, source: 'default' };
  }

  private requireReason(reason: string): string {
    const normalized = typeof reason === 'string' ? reason.trim() : '';
    if (!normalized) throw new UnprocessableEntityException('A non-empty reason is required');
    return normalized;
  }

  private changedEvent(
    key: FeatureFlagKey,
    reason: string,
    before: EvaluatedValue,
    after: EvaluatedValue,
    actor: string,
  ) {
    return {
      type: EventType.FeatureFlagChanged,
      actor,
      payload: { key, reason, before, after },
      refs: [key],
    };
  }
}
