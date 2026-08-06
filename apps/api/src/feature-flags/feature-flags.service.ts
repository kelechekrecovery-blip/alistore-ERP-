import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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
}

interface EvaluatedValue {
  enabled: boolean;
  source: FeatureFlagSource;
}

const featureFlagLockName = (key: FeatureFlagKey) => `feature-flag-override:${key}`;
const featureFlagMutationSetting = 'alistore.feature_flag_mutation_contract';
const featureFlagMutationContract = 'generation-v2';
const featureFlagMutationIdSetting = 'alistore.feature_flag_mutation_id';

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
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.featureFlagOverride.findMany({
        where: { key: { in: [...FEATURE_FLAG_KEYS] } },
      });
      const generations = await tx.featureFlagGeneration.findMany({
        where: { key: { in: [...FEATURE_FLAG_KEYS] } },
      });
      const stored = new Map(rows.map((row) => [row.key, row]));
      const revisions = new Map(
        generations.map((generation) => [generation.key, generation.revision]),
      );
      return FEATURE_FLAGS.map((definition) => this.state(
        definition,
        stored.get(definition.key),
        revisions.get(definition.key) ?? null,
      ));
    }, { isolationLevel: 'RepeatableRead' });
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
      await this.markCurrentMutationImage(tx);
      const generation = await tx.featureFlagGeneration.findUnique({
        where: { key: definition.key },
      });
      const existing = await tx.featureFlagOverride.findUnique({ where: { key: definition.key } });
      this.assertExpectedRevision(generation?.revision ?? null, expectedRevision);
      const before = this.evaluate(definition, existing);
      const revision = (generation?.revision ?? 0) + 1;
      const mutationId = randomUUID();
      const stored = await tx.featureFlagOverride.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          enabled,
          reason: normalizedReason,
          updatedBy: actor,
          active: true,
          evidenceEventId: mutationId,
          evidenceRevision: revision,
          evidenceVersion: 2,
        },
        update: {
          enabled,
          reason: normalizedReason,
          updatedBy: actor,
          active: true,
          evidenceEventId: mutationId,
          evidenceRevision: revision,
          evidenceVersion: 2,
        },
      });
      const nextGeneration = await tx.featureFlagGeneration.findUniqueOrThrow({
        where: { key: definition.key },
      });
      const after: EvaluatedValue = { enabled, source: 'database' };
      return {
        result: this.state(definition, stored, nextGeneration.revision),
        events: [this.changedEvent(
          definition.key,
          normalizedReason,
          before,
          after,
          actor,
          mutationId,
          nextGeneration.revision,
        )],
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
      await this.markCurrentMutationImage(tx);
      const generation = await tx.featureFlagGeneration.findUnique({
        where: { key: definition.key },
      });
      const existing = await tx.featureFlagOverride.findUnique({ where: { key: definition.key } });
      this.assertExpectedRevision(generation?.revision ?? null, expectedRevision);
      const after = this.evaluate(definition);
      if (!existing) {
        return {
          result: this.state(definition, undefined, generation?.revision ?? null),
          events: [],
        };
      }
      const before = this.evaluate(definition, existing);
      const mutationId = randomUUID();
      await this.markMutationId(tx, mutationId);
      await tx.featureFlagOverride.deleteMany({ where: { key: definition.key } });
      const nextGeneration = await tx.featureFlagGeneration.findUnique({
        where: { key: definition.key },
      });
      return {
        result: this.state(definition, undefined, nextGeneration?.revision ?? null),
        events: [this.changedEvent(
          definition.key,
          normalizedReason,
          before,
          after,
          actor,
          mutationId,
          nextGeneration?.revision ?? 0,
        )],
      };
    });
  }

  private state(
    definition: FeatureFlagDefinition,
    row: StoredOverride | undefined,
    revision: number | null,
  ): FeatureFlagState {
    const fallback = this.fallback(definition);
    return {
      ...definition,
      ...(row ? { enabled: row.enabled, source: 'database' as const } : fallback),
      overrideActive: Boolean(row),
      overrideRevision: revision,
      fallback,
    };
  }

  private evaluate(definition: FeatureFlagDefinition, row?: StoredOverride | null): EvaluatedValue {
    if (row) return { enabled: row.enabled, source: 'database' };
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

  /** Satisfy the post-cutover DB contract without leaking state across pooled transactions. */
  private async markCurrentMutationImage(tx: Prisma.TransactionClient): Promise<void> {
    const [result] = await tx.$queryRaw<Array<{ marker: string }>>`
      SELECT set_config(
        ${featureFlagMutationSetting},
        ${featureFlagMutationContract},
        true
      ) AS marker
    `;
    if (result?.marker !== featureFlagMutationContract) {
      throw new Error('Feature flag mutation contract marker was not installed');
    }
  }

  /** Bind a row-deleting reset to the AuditEvent inserted before commit. */
  private async markMutationId(tx: Prisma.TransactionClient, mutationId: string): Promise<void> {
    const [result] = await tx.$queryRaw<Array<{ mutationId: string }>>`
      SELECT set_config(
        ${featureFlagMutationIdSetting},
        ${mutationId},
        true
      ) AS "mutationId"
    `;
    if (result?.mutationId !== mutationId) {
      throw new Error('Feature flag mutation ID was not installed');
    }
  }

  private changedEvent(
    key: FeatureFlagKey,
    reason: string,
    before: EvaluatedValue,
    after: EvaluatedValue,
    actor: string,
    mutationId: string,
    revision: number,
  ) {
    return {
      id: mutationId,
      type: EventType.FeatureFlagChanged,
      actor,
      payload: { key, reason, mutationId, revision, before, after },
      refs: [key],
    };
  }
}
