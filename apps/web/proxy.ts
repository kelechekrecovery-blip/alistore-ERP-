import { NextRequest, NextResponse } from 'next/server';
import { hostDecision } from './lib/host-guard';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/search' && !isMobileUserAgent(request.headers.get('user-agent') ?? '')) {
    const target = request.nextUrl.clone();
    const q = target.searchParams.get('q');
    target.pathname = '/catalog';
    target.search = q ? `?q=${encodeURIComponent(q)}` : '';
    return NextResponse.redirect(target);
  }

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

function isMobileUserAgent(userAgent: string): boolean {
  return /\b(Android|iPhone|iPad|iPod|Mobile)\b/i.test(userAgent);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|products/|favicon.ico|icon.svg).*)'],
};
