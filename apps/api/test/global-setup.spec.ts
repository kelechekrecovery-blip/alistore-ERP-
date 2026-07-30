const {
  assertIsolatedTestDatabase,
  assertNoRoutingOverrides,
  databaseTarget,
  redactSensitiveOutput,
} = require('./global-setup.js').__test;

describe('isolated API test database setup', () => {
  it('treats different credentials and loopback spellings as the same database target', () => {
    const configured = 'postgresql://app:one@localhost/alistore_test';
    const test = 'postgres://admin:two@127.0.0.1:5432/alistore_test';

    expect(databaseTarget(configured)).toBe(databaseTarget(test));
    expect(() => assertIsolatedTestDatabase(test, configured))
      .toThrow('TEST_DATABASE_URL must target a different database');
  });

  it('rejects connection-string query parameters that can reroute node-postgres', () => {
    const rerouted =
      'postgresql://user:secret@safe.example:5432/alistore_test?host=prod.example&port=6432';

    expect(() => assertNoRoutingOverrides(rerouted, 'TEST_DATABASE_URL'))
      .toThrow('forbidden query parameters: host, port');
    expect(() => assertIsolatedTestDatabase(
      rerouted,
      'postgresql://user:secret@prod.example:6432/alistore_test',
    )).toThrow('forbidden query parameters: host, port');
  });

  it('does not allow a confirmation environment variable to bypass target isolation', () => {
    const previous = process.env.ALISTORE_TEST_DATABASE_CONFIRMED;
    process.env.ALISTORE_TEST_DATABASE_CONFIRMED = '1';
    try {
      expect(() => assertIsolatedTestDatabase(
        'postgresql://admin:two@localhost:5432/alistore_test',
        'postgresql://app:one@localhost/alistore_test',
      )).toThrow('TEST_DATABASE_URL must target a different database');
    } finally {
      if (previous === undefined) delete process.env.ALISTORE_TEST_DATABASE_CONFIRMED;
      else process.env.ALISTORE_TEST_DATABASE_CONFIRMED = previous;
    }
  });

  it('redacts full URLs, encoded credentials and query secrets from diagnostics', () => {
    const url = 'postgresql://user:p%2Fss@localhost:5432/alistore_test?sslpassword=t%2Fken';
    const output = `failed ${url} p/ss p%2Fss t/ken t%2Fken`;

    const redacted = redactSensitiveOutput(output, [url]);

    expect(redacted).not.toContain('p/ss');
    expect(redacted).not.toContain('p%2Fss');
    expect(redacted).not.toContain('t/ken');
    expect(redacted).not.toContain('t%2Fken');
    expect(redacted).not.toContain('postgresql://');
  });
});
