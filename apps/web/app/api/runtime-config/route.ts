import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    sentryDsn: process.env.SENTRY_DSN ?? null,
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    demoMode: process.env.PUBLIC_DEMO_MODE === 'true',
  });
}
