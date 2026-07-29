const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
});

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function errorResponse(code, message, status, details, requestId) {
  return jsonResponse({
    code,
    message,
    ...(requestId ? { requestId } : {}),
    ...(details === undefined ? {} : { details }),
  }, status);
}
