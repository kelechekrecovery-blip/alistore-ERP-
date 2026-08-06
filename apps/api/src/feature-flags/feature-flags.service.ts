import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError } from '../common/errors';
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
  overrideActive: boolean;
  overrideRevision: number | null;
  fallback: FeatureFlagFallback;
}

export interface FeatureFlagFallback {
  enabled: boolean;
  source: Exclude<FeatureFlagSource, 'database'>;
}

interface StoredOverride {
  key: string;
  enabled: boolean;
  active: boolean;
  revision: number;
}

interface EvaluatedValue {
  enabled: boolean;
  source: FeatureFlagSource;
}

const featureFlagLockName = (key: FeatureFlagKey) => `feature-flag-override:${key}`;

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

  async set(
    key: string,
    enabled: boolean,
    reason: string,
    actor: string,
    expectedRevision: number | null,
  ): Promise<FeatureFlagState> {
    const definition = featureFlagDefinition(key);
    const normalizedReason = this.requireReason(reason);

    return this.audit.transaction(async (tx) => {
      await this.lockOverride(tx, definition.key);
      const existing = await tx.featureFlagOverride.findUnique({ where: { key: definition.key } });
      this.assertExpectedRevision(existing?.revision ?? null, expectedRevision);
      const before = this.evaluate(definition, existing);
      const stored = await tx.featureFlagOverride.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          enabled,
          reason: normalizedReason,
          updatedBy: actor,
          active: true,
        },
        update: {
          enabled,
          reason: normalizedReason,
          updatedBy: actor,
          active: true,
          revision: { increment: 1 },
        },
      });
      const after: EvaluatedValue = { enabled, source: 'database' };
      return {
        result: this.state(definition, stored),
        events: [this.changedEvent(definition.key, normalizedReason, before, after, actor)],
      };
    });
  }

  async reset(
    key: string,
    reason: string,
    actor: string,
    expectedRevision: number | null,
  ): Promise<FeatureFlagState> {
    const definition = featureFlagDefinition(key);
    const normalizedReason = this.requireReason(reason);

    return this.audit.transaction(async (tx) => {
      await this.lockOverride(tx, definition.key);
      const existing = await tx.featureFlagOverride.findUnique({ where: { key: definition.key } });
      this.assertExpectedRevision(existing?.revision ?? null, expectedRevision);
      const before = this.evaluate(definition, existing);
      const after = this.evaluate(definition);
      const stored = await tx.featureFlagOverride.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          enabled: after.enabled,
          reason: normalizedReason,
          updatedBy: actor,
          active: false,
        },
        update: {
          reason: normalizedReason,
          updatedBy: actor,
          active: false,
          revision: { increment: 1 },
        },
      });
      return {
        result: this.state(definition, stored),
        events: [this.changedEvent(definition.key, normalizedReason, before, after, actor)],
      };
    });
  }

  private state(definition: FeatureFlagDefinition, row?: StoredOverride): FeatureFlagState {
    const fallback = this.fallback(definition);
    return {
      ...definition,
      ...(row?.active ? { enabled: row.enabled, source: 'database' as const } : fallback),
      overrideActive: row?.active ?? false,
      overrideRevision: row?.revision ?? null,
      fallback,
    };
  }

  private evaluate(definition: FeatureFlagDefinition, row?: StoredOverride | null): EvaluatedValue {
    if (row?.active) return { enabled: row.enabled, source: 'database' };
    return this.fallback(definition);
  }

  private fallback(definition: FeatureFlagDefinition): FeatureFlagFallback {
    const rawEnvironmentValue = this.config.get<unknown>(definition.legacyEnv);
    if (rawEnvironmentValue !== undefined) {
      return {
        enabled: String(rawEnvironmentValue).trim().toLowerCase() === 'true',
        source: 'environment',
      };
    }
    return { enabled: definition.defaultEnabled, source: 'default' };
  }

  private assertExpectedRevision(current: number | null, expected: number | null): void {
    if (current !== expected) {
      throw new ConflictError(
        'feature_flag_revision_conflict',
        'Feature flag changed since it was loaded; refresh and confirm the latest state',
      );
    }
  }

  private requireReason(reason: string): string {
    const normalized = typeof reason === 'string' ? reason.trim() : '';
    if (!normalized) throw new UnprocessableEntityException('A non-empty reason is required');
    return normalized;
  }

  /** Serialize one flag's read/mutate/event chain until its transaction commits. */
  private async lockOverride(tx: Prisma.TransactionClient, key: FeatureFlagKey): Promise<void> {
    await tx.$queryRaw<Array<{ locked: number }>>`
      SELECT 1 AS "locked"
      FROM pg_advisory_xact_lock(hashtextextended(${featureFlagLockName(key)}, 0))
    `;
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
