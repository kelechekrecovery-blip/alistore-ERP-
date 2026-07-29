export function extractWorkerRoutes(source) {
  return [...source.matchAll(/\['(GET|POST|PUT|PATCH|DELETE) (\/api\/[^']+)'/gu)]
    .map((match) => `${match[1]} ${match[2]}`);
}

export function summarizeRouteCoverage(endpoints, migratedRoutes) {
  const required = new Set(endpoints.map(({ method, path }) => `${method} ${path}`));
  const migrated = new Set(migratedRoutes);
  const missing = [...required].filter((route) => !migrated.has(route)).sort();
  const unknown = [...migrated].filter((route) => !required.has(route)).sort();

  return {
    required: required.size,
    migrated: migrated.size,
    covered: required.size - missing.length,
    missing,
    unknown,
    complete: missing.length === 0 && unknown.length === 0,
  };
}
