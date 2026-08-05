import { describe, expect, it } from 'vitest';
import { loginHref, safeLoginNext } from './login-next';

describe('safeLoginNext', () => {
  it('returns a plain relative path unchanged', () => {
    expect(safeLoginNext('/catalog')).toBe('/catalog');
  });

  it('keeps a path with a query string', () => {
    expect(safeLoginNext('/catalog?category=Смартфоны')).toBe('/catalog?category=Смартфоны');
  });

  it('falls back to "/" for a protocol-relative URL (open-redirect attempt)', () => {
    expect(safeLoginNext('//evil.example.com')).toBe('/');
  });

  it('falls back for a backslash URL that browsers normalize to another host', () => {
    expect(safeLoginNext('/\\evil.example.com')).toBe('/');
    expect(safeLoginNext('/catalog\\..\\evil.example.com')).toBe('/');
  });

  it('falls back for control characters stripped by URL parsing', () => {
    expect(safeLoginNext('/\t/evil.example.com')).toBe('/');
    expect(safeLoginNext('/\n/evil.example.com')).toBe('/');
    expect(safeLoginNext('/\r/evil.example.com')).toBe('/');
  });

  it('falls back to "/" for an absolute URL', () => {
    expect(safeLoginNext('https://evil.example.com/phish')).toBe('/');
  });

  it('falls back to "/" for a path missing the leading slash', () => {
    expect(safeLoginNext('account')).toBe('/');
  });

  it('falls back to "/" for null', () => {
    expect(safeLoginNext(null)).toBe('/');
  });

  it('falls back to "/" for undefined', () => {
    expect(safeLoginNext(undefined)).toBe('/');
  });

  it('falls back to "/" for an empty string', () => {
    expect(safeLoginNext('')).toBe('/');
  });

  it('honours a custom fallback', () => {
    expect(safeLoginNext('//evil.example.com', '/account')).toBe('/account');
  });
});

describe('loginHref', () => {
  it('builds a /login URL with an encoded next for a safe path', () => {
    expect(loginHref('/catalog')).toBe('/login?next=%2Fcatalog');
  });

  it('never leaks an attacker-controlled host through next', () => {
    expect(loginHref('//evil.example.com')).toBe('/login?next=%2F');
  });
});
