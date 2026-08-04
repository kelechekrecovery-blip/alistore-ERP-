import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const update = await request.json().catch(() => null);
  return NextResponse.json({
    ok: true,
    status: 'stub',
    received: Boolean(update),
    note: 'Telegram bot webhook placeholder; Mini App checkout uses the shared API.',
  });
}
