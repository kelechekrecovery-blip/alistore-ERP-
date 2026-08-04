import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length === 0) {
    return NextResponse.json({ ok: false, code: 'telegram_webhook_body_empty' }, { status: 400 });
  }
  if (raw.length > 1_000_000) {
    return NextResponse.json({ ok: false, code: 'telegram_webhook_body_too_large' }, { status: 413 });
  }
  try {
    JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, code: 'telegram_webhook_invalid_json' }, { status: 400 });
  }

  const configuredBase = process.env.API_INTERNAL_BASE ?? process.env.NEXT_PUBLIC_API_BASE;
  if (!configuredBase?.trim()) {
    return NextResponse.json({ ok: false, code: 'telegram_webhook_api_not_configured' }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${configuredBase.replace(/\/$/u, '')}/telegram-agent/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('x-telegram-bot-api-secret-token')
          ? { 'x-telegram-bot-api-secret-token': request.headers.get('x-telegram-bot-api-secret-token') as string }
          : {}),
      },
      body: raw,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ ok: false, code: 'telegram_webhook_api_unavailable' }, { status: 503 });
  }

  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
