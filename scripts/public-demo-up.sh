#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/.artifacts/public-demo"
TUNNEL_LOG="$ARTIFACT_DIR/cloudflared.log"
TUNNEL_PID="$ARTIFACT_DIR/cloudflared.pid"

command -v cloudflared >/dev/null 2>&1 || {
  echo "cloudflared is required" >&2
  exit 1
}

if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo "Set CLOUDFLARE_TUNNEL_TOKEN in the shell environment; never put it in Git." >&2
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"
cd "$ROOT_DIR"

# Барьер, которого здесь не было, — и из-за этого 21.07.2026 боевой контур
# полтора суток стоял в dev-режиме.
#
# Цепочка была такая: этот скрипт зовёт local-up.sh, тот — `npm run api`, то есть
# `ts-node src/main.ts` без NODE_ENV. А весь production-preflight
# (apps/api/src/health/production-preflight.ts) и проверка слабого JWT_SECRET
# (apps/api/src/auth/jwt-secret.ts) включаются ТОЛЬКО при NODE_ENV=production.
# В итоге наружу торчал сервис, подписывающий токены секретом
# `dev-secret-alistore-local` из репозитория (e2e/helpers.ts), с открытым Swagger,
# незащищённым /api/metrics и OTP-кодом прямо в теле ответа.
#
# Проверки ниже намеренно грубые и обязаны отказывать: публиковать наружу то, что
# запущено как для разработки, нельзя ни при каких обстоятельствах. Настоящий
# путь в прод — собранный образ на Render (render.yaml), а не этот скрипт.
refuse() {
  echo "ОТКАЗ: $1" >&2
  echo "Публикация наружу отменена. Ничего не запущено, туннель не поднят." >&2
  exit 1
}

: "${JWT_SECRET:=}"
if [ -z "$JWT_SECRET" ] && [ -f "$ROOT_DIR/apps/api/.env" ]; then
  JWT_SECRET="$(sed -n 's/^JWT_SECRET=//p' "$ROOT_DIR/apps/api/.env" | tail -1 | tr -d '"'"'"'')"
fi

[ -n "$JWT_SECRET" ] || refuse "JWT_SECRET не задан."
[ "${#JWT_SECRET}" -ge 32 ] || refuse "JWT_SECRET короче 32 символов (${#JWT_SECRET})."
[ "$JWT_SECRET" != "dev-secret-alistore-local" ] || \
  refuse "JWT_SECRET совпадает с секретом из репозитория. Любой может выпустить owner-токен."

case "${AUTH_OTP_DEV_ECHO:-$(sed -n 's/^AUTH_OTP_DEV_ECHO=//p' "$ROOT_DIR/apps/api/.env" 2>/dev/null | tail -1)}" in
  true|TRUE|1) refuse "AUTH_OTP_DEV_ECHO включён — код OTP вернётся в теле ответа кому угодно." ;;
esac

export NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-https://api.ali.kg/api}"
export NEXT_PUBLIC_DEMO_MODE="${NEXT_PUBLIC_DEMO_MODE:-true}"
export PUBLIC_DEMO_MODE="${PUBLIC_DEMO_MODE:-true}"
bash scripts/local-up.sh

if [ -f "$TUNNEL_PID" ] && kill -0 "$(cat "$TUNNEL_PID")" 2>/dev/null; then
  echo "Cloudflare tunnel is already running (PID $(cat "$TUNNEL_PID"))"
else
  nohup cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN" alistore-erp >"$TUNNEL_LOG" 2>&1 &
  echo $! >"$TUNNEL_PID"
  echo "Started Cloudflare tunnel (PID $!)"
fi

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 https://ali.kg/ >/dev/null \
    && curl -fsS --max-time 5 https://api.ali.kg/api/health/live >/dev/null; then
    echo "AliStore public demo is online: https://ali.kg/"
    exit 0
  fi
  sleep 1
done

echo "Public demo did not become reachable; inspect $TUNNEL_LOG" >&2
exit 1
