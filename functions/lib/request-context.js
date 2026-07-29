export function createRequestContext(request) {
  const incoming = request.headers.get('x-request-id')?.trim();
  const cloudflareRay = request.headers.get('cf-ray')?.split('-')[0]?.trim();
  return {
    requestId: incoming || cloudflareRay || crypto.randomUUID(),
  };
}
