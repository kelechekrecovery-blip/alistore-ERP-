import { NextResponse } from 'next/server';

export function GET() {
  const demoMode = [process.env.PUBLIC_DEMO_MODE, process.env.NEXT_PUBLIC_DEMO_MODE]
    .some((value) => value?.trim().toLowerCase() === 'true');
  return NextResponse.json({
    sentryDsn: process.env.SENTRY_DSN ?? null,
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    demoMode,
  });
}
