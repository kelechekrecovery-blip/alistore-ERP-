export interface SegmentRules {
  level?: string;
  city?: string;
  tags?: string[];
  minSpent?: number;
  maxSpent?: number;
  minLtv?: number;
  maxLtv?: number;
  limit?: number;
}

export interface AudienceCustomer {
  id: string;
  name: string;
  phone: string;
  consent: boolean;
  segments: string[];
  ltv: number;
  spent: number;
}

export interface SegmentMatch {
  customer: AudienceCustomer;
  eligible: boolean;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function normalizeSegmentRules(input: SegmentRules): Required<Pick<SegmentRules, 'tags' | 'limit'>> & SegmentRules {
  const tags = [...(input.tags ?? [])]
    .map((tag) => tag.trim())
    .filter(Boolean);
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  return {
    ...input,
    level: clean(input.level),
    city: clean(input.city),
    tags,
    limit,
  };
}

export function segmentLabel(rules: SegmentRules): string {
  const normalized = normalizeSegmentRules(rules);
  return JSON.stringify({
    level: normalized.level,
    city: normalized.city,
    tags: normalized.tags,
    minSpent: normalized.minSpent,
    maxSpent: normalized.maxSpent,
    minLtv: normalized.minLtv,
    maxLtv: normalized.maxLtv,
    limit: normalized.limit,
  });
}

export function parseSegmentLabel(label: string): SegmentRules {
  try {
    const parsed = JSON.parse(label) as SegmentRules;
    return normalizeSegmentRules(parsed);
  } catch {
    return normalizeSegmentRules({ tags: [label] });
  }
}

export function describeSegment(rules: SegmentRules): string {
  const normalized = normalizeSegmentRules(rules);
  const parts = [
    normalized.level ? `level:${normalized.level}` : null,
    normalized.city ? `city:${normalized.city}` : null,
    normalized.tags.length ? `tags:${normalized.tags.join(',')}` : null,
    normalized.minSpent !== undefined ? `spent>=${normalized.minSpent}` : null,
    normalized.maxSpent !== undefined ? `spent<=${normalized.maxSpent}` : null,
    normalized.minLtv !== undefined ? `ltv>=${normalized.minLtv}` : null,
    normalized.maxLtv !== undefined ? `ltv<=${normalized.maxLtv}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'all consented customers';
}

export function buildSegmentAudience(
  customers: AudienceCustomer[],
  input: SegmentRules,
): SegmentMatch[] {
  const rules = normalizeSegmentRules(input);
  return customers
    .filter((customer) => matchesRules(customer, rules))
    .map((customer) => ({ customer, eligible: customer.consent }));
}

function matchesRules(customer: AudienceCustomer, rules: SegmentRules): boolean {
  if (rules.level && !hasSegment(customer, rules.level)) return false;
  if (rules.city && !hasCity(customer, rules.city)) return false;
  for (const tag of rules.tags ?? []) {
    if (!hasSegment(customer, tag)) return false;
  }
  if (rules.minSpent !== undefined && customer.spent < rules.minSpent) return false;
  if (rules.maxSpent !== undefined && customer.spent > rules.maxSpent) return false;
  if (rules.minLtv !== undefined && customer.ltv < rules.minLtv) return false;
  if (rules.maxLtv !== undefined && customer.ltv > rules.maxLtv) return false;
  return true;
}

function hasSegment(customer: AudienceCustomer, value: string): boolean {
  const wanted = normalize(value);
  return customer.segments.some((segment) => normalize(segment) === wanted);
}

function hasCity(customer: AudienceCustomer, city: string): boolean {
  const wanted = normalize(city);
  return customer.segments.some((segment) => {
    const normalized = normalize(segment);
    return normalized === wanted || normalized === `city:${wanted}` || normalized === `город:${wanted}`;
  });
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
