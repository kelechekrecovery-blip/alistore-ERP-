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
