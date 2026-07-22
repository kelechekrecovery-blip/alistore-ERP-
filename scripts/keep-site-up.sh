#!/usr/bin/env bash
# Сторож боевых процессов, пока сайт живёт на этой машине через Cloudflare Tunnel.
#
# Это ВРЕМЕННАЯ мера, а не архитектура. Причина простоев описана в
# docs/PRODUCTION-ARCHITECTURE-REVIEW.md: боевой магазин не должен зависеть от
# того, включён ли ноутбук. Правильное решение — развернуть render.yaml и
# переключить DNS с туннеля на Render.
#
# Разделение обязанностей:
#   launchd (KeepAlive)  — поднимает УПАВШИЙ процесс;
#   этот сторож          — ловит ЗАВИСШИЙ: процесс жив, порт занят, health молчит.
# Второе launchd не умеет в принципе, поэтому сторож нужен и при живых агентах.
#
# Почему kickstart, а не запуск руками: прежняя версия поднимала сервисы через
# `nohup ... & disown`, и они становились сиротами вне launchd. Именно так
# 23.07.2026 боевой API оказался дочерним процессом приложения Codex, а витрина —
# процессом с PPID 1 без супервизора вовсе. Сторож обязан возвращать сервис
# ТОМУ ЖЕ владельцу, а не плодить второго.
#
# Запуск вручную:      bash scripts/keep-site-up.sh --once
# Включить постоянно:  см. scripts/com.alistore.keepsiteup.plist
set -uo pipefail

LOG="${TMPDIR:-/tmp}/alistore-keepalive.log"
DOMAIN="gui/$(id -u)"

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

is_up() { # $1 = url
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$1" 2>/dev/null || echo 000)
  [ "$code" = "200" ]
}

agent_loaded() { launchctl print "$DOMAIN/$1" >/dev/null 2>&1; }

# Возвращает сервис launchd, а не запускает копию мимо него. -kшлёт SIGKILL
# текущему процессу, если он ещё жив: зависший процесс держит порт, и без этого
# новый экземпляр не поднялся бы.
revive() { # $1 = label, $2 = человеческое имя
  if ! agent_loaded "$1"; then
    log "ВНИМАНИЕ: агент $1 не загружен — $2 поднять некому."
    log "         установите: cp scripts/$1.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/$1.plist"
    return 1
  fi
  log "$2 не отвечает — перезапускаю через launchctl kickstart $1"
  launchctl kickstart -k "$DOMAIN/$1" >/dev/null 2>&1
}

check_once() {
  is_up "http://127.0.0.1:4000/api/health/ready" || revive com.alistore.api "API (4000)"
  is_up "http://127.0.0.1:3000/"                || revive com.alistore.web "витрина (3000)"

  # Туннель: без него сайт недоступен снаружи, даже если процессы живы.
  if ! pgrep -f "cloudflared tunnel" >/dev/null 2>&1; then
    revive com.alistore.cloudflared "туннель cloudflared"
  fi

  # Сон — главная причина простоев (22ч37м из 52ч на 23.07.2026), и сторож против
  # него бессилен: спящая машина не выполняет ничего, включая этот скрипт.
  # Поэтому не «чиним», а громко фиксируем, если защиту сняли.
  if [ "$(pmset -g 2>/dev/null | awk '/SleepDisabled/{print $2}')" != "1" ]; then
    log "ВНИМАНИЕ: sleep не запрещён — закрытая крышка снова погасит сайт."
    log "         включите: sudo pmset -a disablesleep 1"
  fi
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
