import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production' || request.nextUrl.pathname === '/healthz') {
    return NextResponse.next();
  }
  const allowed = (process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const host = (request.headers.get('host') ?? '').split(':', 1)[0].toLowerCase();
  if (allowed.length === 0 || !allowed.includes(host)) {
    return new NextResponse('Misdirected Request', { status: 421 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|products/|favicon.ico|icon.svg).*)'],
};
