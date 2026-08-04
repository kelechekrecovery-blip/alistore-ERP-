import * as Sentry from '@sentry/nextjs';

const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (publicDsn) {
  init(publicDsn, process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV);
} else {
  void fetch('/api/runtime-config')
    .then((response) => response.ok ? response.json() : null)
    .then((config: { sentryDsn?: string; sentryEnvironment?: string } | null) => {
      if (config?.sentryDsn) init(config.sentryDsn, config.sentryEnvironment);
    });
}

function init(dsn: string, environment?: string) {
  Sentry.init({ dsn, environment, tracesSampleRate: 0.1, sendDefaultPii: false });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
