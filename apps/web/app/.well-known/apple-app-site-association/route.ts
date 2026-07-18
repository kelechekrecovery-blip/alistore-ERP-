import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) return NextResponse.json({ applinks: { details: [] } }, { status: 503 });
  return NextResponse.json({
    applinks: {
      details: [{
        appID: `${teamId}.kg.alistore.client`,
        paths: ['/order/*', '/payment-return*', '/account/*', '/warranty', '/support'],
      }],
    },
  }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
