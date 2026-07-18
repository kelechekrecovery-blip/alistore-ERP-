import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const fingerprints = (process.env.ANDROID_APP_LINK_SHA256 ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (fingerprints.length === 0) return NextResponse.json([], { status: 503 });
  return NextResponse.json(
    ['kg.alistore.client', 'kg.alistore.staff', 'kg.alistore.courier', 'kg.alistore.pos']
      .flatMap((packageName) => fingerprints.map((fingerprint) => ({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: [fingerprint] },
      }))),
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
