import { Prisma, StorePoint } from '@prisma/client';
import { ValidationError } from './errors';

type StorePointReader = {
  storePoint: {
    findFirst(args: Prisma.StorePointFindFirstArgs): Promise<StorePoint | null>;
  };
};

const LEGACY_CODE_ALIASES = new Map<string, string>([
  ['alistore-center', 'center'],
  ['alistore центр', 'center'],
]);

/** Convert historical UI labels into a query without inventing a default point. */
export function storePointIdentityWhere(rawReference: string): Prisma.StorePointWhereInput {
  const reference = rawReference.trim();
  const normalized = reference.toLocaleLowerCase('ru-RU');
  const code = LEGACY_CODE_ALIASES.get(normalized) ?? normalized;
  return {
    OR: [
      { id: reference },
      { code },
      { inventoryLocation: { in: [reference, reference.toUpperCase()] } },
    ],
  };
}

/**
 * Resolve an explicitly supplied point to its canonical StorePoint row.
 * Operational mutations deliberately have no "first active point" fallback.
 */
export async function resolveActiveStorePoint(
  db: StorePointReader,
  rawReference: string | null | undefined,
  message = 'Точка недоступна или отключена',
): Promise<StorePoint> {
  const reference = rawReference?.trim();
  if (!reference) throw new ValidationError('store_point_required', 'Выберите активную точку');
  const point = await db.storePoint.findFirst({
    where: { active: true, ...storePointIdentityWhere(reference) },
  });
  if (!point) throw new ValidationError('store_point_unavailable', message);
  return point;
}
