#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/.artifacts/local"
mkdir -p "$ARTIFACT_DIR"
cd "$ROOT_DIR"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "✗ Не найдено: $1" >&2
    exit 1
  }
}

require_command node
require_command npm
require_command psql
require_command pg_isready
require_command redis-cli
require_command curl

pg_isready -h 127.0.0.1 -p 5432 >/dev/null || {
  echo "✗ PostgreSQL не отвечает на 127.0.0.1:5432" >&2
  exit 1
}
redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null || {
  echo "✗ Redis не отвечает на 127.0.0.1:6379" >&2
  exit 1
}

echo "▸ Проверка миграций"
npm run db:deploy -w @alistore/api

is_healthy() {
  curl -fsS --max-time 2 "$1" >/dev/null 2>&1
}

start_service() {
  local name="$1"
  local command="$2"
  local health_url="$3"
  local pid_file="$ARTIFACT_DIR/$name.pid"
  local log_file="$ARTIFACT_DIR/$name.log"

  if is_healthy "$health_url"; then
    echo "  ✓ $name уже работает"
    return
  fi

  if [ -f "$pid_file" ]; then
    local old_pid
    old_pid="$(cat "$pid_file")"
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "  ! $name уже запущен (PID $old_pid), но health endpoint пока не отвечает"
      return
    fi
    rm -f "$pid_file"
  fi

  echo "▸ Запуск $name"
  nohup bash -lc "$command" >"$log_file" 2>&1 &
  echo $! >"$pid_file"
}

start_worker() {
  local pid_file="$ARTIFACT_DIR/worker.pid"
  local log_file="$ARTIFACT_DIR/worker.log"

  if pgrep -f 'node dist/worker.js' >/dev/null 2>&1; then
    echo "  ✓ worker уже работает"
    return
  fi

  if [ -f "$pid_file" ]; then
    local old_pid
    old_pid="$(cat "$pid_file")"
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "  ! worker уже запущен (PID $old_pid)"
      return
    fi
    rm -f "$pid_file"
  fi

  echo "▸ Запуск worker"
  nohup bash -lc "JOB_BACKEND=bullmq REDIS_URL=redis://127.0.0.1:6379 OUTBOX_RELAY_ENABLED=true RESERVATION_SWEEP_ENABLED=true DEBT_REMINDERS_ENABLED=true npm run start:worker -w @alistore/api" >"$log_file" 2>&1 &
  echo $! >"$pid_file"
}

start_service api "npm run api" "http://127.0.0.1:4000/api/health/live"
start_worker
start_service web "npm run web" "http://127.0.0.1:3000/healthz"

for attempt in $(seq 1 30); do
  if is_healthy "http://127.0.0.1:4000/api/health/ready" && is_healthy "http://127.0.0.1:3000/healthz"; then
    echo
    echo "✓ AliStore local ecosystem is online"
    echo "  Storefront: http://127.0.0.1:3000/"
    echo "  ERP:        http://127.0.0.1:3000/erp"
    echo "  POS:        http://127.0.0.1:3000/pos"
    echo "  Staff:      http://127.0.0.1:3000/staff"
    echo "  Warehouse:  http://127.0.0.1:3000/warehouse"
    echo "  API:        http://127.0.0.1:4000/api"
    echo "  Logs:       $ARTIFACT_DIR"
    exit 0
  fi
  sleep 1
done

echo "✗ Сервисы не прошли readiness за 30 секунд" >&2
echo "  См. логи: $ARTIFACT_DIR" >&2
exit 1
