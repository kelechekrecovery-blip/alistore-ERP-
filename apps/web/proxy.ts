import { NextRequest, NextResponse } from 'next/server';
import { hostDecision } from './lib/host-guard';

export function proxy(request: NextRequest) {
  const decision = hostDecision(
    request.nextUrl.pathname,
    request.headers.get('host') ?? '',
    process.env.ALLOWED_HOSTS,
    process.env.NODE_ENV === 'production',
  );
  if (decision === 'reject') {
    return new NextResponse('Misdirected Request', { status: 421 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|products/|favicon.ico|icon.svg).*)'],
};
