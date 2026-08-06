import { NextResponse } from 'next/server';

export function GET() {
  const response = NextResponse.json({ status: 'ok' });
  const revision = process.env.RENDER_GIT_COMMIT?.trim();
  if (revision) response.headers.set('X-AliStore-Revision', revision);
  return response;
}
