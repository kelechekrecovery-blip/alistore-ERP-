import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { HelmetOptions } from 'helmet';
import type { RequestHandler } from 'express';

export type RuntimeEnvReader = (name: string) => string | undefined;

export function resolveCorsOptions(env: RuntimeEnvReader): CorsOptions {
  const origins = parseOrigins(env('CORS_ORIGINS'));
  if (env('NODE_ENV') === 'production' && origins.length === 0) {
    throw new Error('CORS_ORIGINS is required in production');
  }
  // `credentials` must be enabled on both branches: staff and customer web auth
  // is cookie-based (`fetch(..., { credentials: 'include' })`), and without
  // Access-Control-Allow-Credentials the browser rejects every such response —
  // local dev without CORS_ORIGINS could not log in at all ("Failed to fetch").
  return origins.length > 0
    ? { origin: origins, credentials: true }
    : { origin: true, credentials: true };
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

/**
 * Сколько обратных прокси стоит перед приложением. Express доверяет ровно
 * этому числу последних адресов в `X-Forwarded-For` и берёт следующий за ними
 * как `req.ip`.
 *
 * Зачем: без этого `req.ip` равен адресу прокси (для cloudflared — `127.0.0.1`),
 * то есть у всех клиентов планеты один общий бакет rate-limit, и три запроса
 * гасят вход по SMS всем сразу. Слепо читать `X-Forwarded-For` вместо этого
 * нельзя: заголовок подделывается клиентом, и лимит превратился бы в фикцию.
 *
 * Вне production по умолчанию выключено: там обращаются напрямую, и доверие к
 * заголовку дало бы именно ту подделку, от которой мы защищаемся.
 */
export function resolveTrustProxy(env: RuntimeEnvReader): number | false {
  const raw = env('TRUST_PROXY_HOPS')?.trim();
  if (raw === undefined || raw === '') {
    return env('NODE_ENV') === 'production' ? 1 : false;
  }
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(`Invalid TRUST_PROXY_HOPS: ${raw}`);
  }
  return hops === 0 ? false : hops;
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
