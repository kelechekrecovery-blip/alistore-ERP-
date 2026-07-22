#!/usr/bin/env bash
# Сторож боевых процессов, пока сайт живёт на этой машине через Cloudflare Tunnel.
#
# Это ВРЕМЕННАЯ мера, а не архитектура. Причина простоев описана в
# docs/PRODUCTION-ARCHITECTURE-REVIEW.md: боевой магазин не должен зависеть от
# того, включён ли ноутбук. Правильное решение — развернуть render.yaml и
# переключить DNS с туннеля на Render. Сторож лишь сокращает простой до минуты,
# пока переезд не сделан.
#
# Что делает: раз в минуту проверяет витрину (3000) и API (4000); если процесс
# не отвечает — поднимает его заново. Ничего не удаляет и не мигрирует.
#
# Запуск вручную:      bash scripts/keep-site-up.sh
# Включить постоянно:  см. scripts/com.alistore.keepsiteup.plist
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE_PUBLIC="https://api.ali.kg/api"
LOG="${TMPDIR:-/tmp}/alistore-keepalive.log"

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

is_up() { # $1 = url
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$1" 2>/dev/null || echo 000)
  [ "$code" = "200" ]
}

start_web() {
  log "витрина (3000) не отвечает — поднимаю"
  cd "$REPO/apps/web" || return 1
  nohup env NEXT_PUBLIC_API_BASE="$API_BASE_PUBLIC" NODE_ENV=production \
    npx next start -p 3000 >> "${TMPDIR:-/tmp}/alistore-web-prod.log" 2>&1 &
  disown 2>/dev/null || true
}

start_api() {
  log "API (4000) не отвечает — поднимаю"
  cd "$REPO" || return 1
  nohup npm run start:prod -w @alistore/api >> "${TMPDIR:-/tmp}/alistore-api-prod.log" 2>&1 &
  disown 2>/dev/null || true
}

check_once() {
  is_up "http://127.0.0.1:4000/api/health/ready" || start_api
  is_up "http://127.0.0.1:3000/"                || start_web
  # Туннель: без него сайт недоступен снаружи, даже если процессы живы.
  pgrep -f "cloudflared tunnel" >/dev/null 2>&1 || \
    log "ВНИМАНИЕ: cloudflared не запущен — сайт недоступен снаружи (поднимите туннель вручную)"
}

if [ "${1:-}" = "--once" ]; then
  check_once
else
  log "сторож запущен"
  while true; do
    check_once
    sleep 60
  done
fi
