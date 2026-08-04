import { shouldExposeOpenApi } from '../src/openapi';

describe('OpenAPI exposure policy', () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];

  it('exposes Swagger in local development', () => {
    expect(shouldExposeOpenApi(env({ NODE_ENV: 'development' }))).toBe(true);
    expect(shouldExposeOpenApi(env({ NODE_ENV: 'test' }))).toBe(true);
  });

  it('allows an explicit local runtime deny switch', () => {
    expect(
      shouldExposeOpenApi(env({ NODE_ENV: 'development', API_DOCS_ENABLED: 'false' })),
    ).toBe(false);
  });

  it('never exposes Swagger in production, even when the legacy override is set', () => {
    expect(
      shouldExposeOpenApi(env({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' })),
    ).toBe(false);
  });
});
