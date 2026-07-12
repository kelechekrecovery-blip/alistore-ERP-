import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { HelmetOptions } from 'helmet';
import type { RequestHandler } from 'express';

export type RuntimeEnvReader = (name: string) => string | undefined;

export function resolveCorsOptions(env: RuntimeEnvReader): CorsOptions {
  const origins = parseOrigins(env('CORS_ORIGINS'));
  if (env('NODE_ENV') === 'production' && origins.length === 0) {
    throw new Error('CORS_ORIGINS is required in production');
  }
  return origins.length > 0
    ? { origin: origins, credentials: true }
    : { origin: true };
}

export function resolveHelmetOptions(env: RuntimeEnvReader): HelmetOptions {
  const production = env('NODE_ENV') === 'production';
  return {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    strictTransportSecurity: production
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
  };
}

export function resolveAllowedHosts(env: RuntimeEnvReader): string[] {
  const hosts = (env('ALLOWED_HOSTS') ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (env('NODE_ENV') === 'production' && hosts.length === 0) {
    throw new Error('ALLOWED_HOSTS is required in production');
  }
  for (const host of hosts) {
    if (host.includes('://') || host.includes('/') || host.includes(':') || host === 'localhost') {
      throw new Error(`Invalid allowed host: ${host}`);
    }
  }
  return [...new Set(hosts)];
}

export function allowedHostsMiddleware(env: RuntimeEnvReader): RequestHandler {
  const allowed = resolveAllowedHosts(env);
  return (request, response, next) => {
    if (env('NODE_ENV') !== 'production' || request.path.startsWith('/api/health/')) {
      next();
      return;
    }
    const host = (request.headers.host ?? '').split(':', 1)[0].toLowerCase();
    if (!allowed.includes(host)) {
      response.status(421).json({ statusCode: 421, message: 'Misdirected Request' });
      return;
    }
    next();
  };
}

function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(`Invalid CORS origin: ${origin}`);
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
        throw new Error(`Invalid CORS origin: ${origin}`);
      }
      return origin;
    });
}
