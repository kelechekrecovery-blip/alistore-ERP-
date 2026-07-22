#!/usr/bin/env bash
# Точка входа боевого API под launchd (агент com.alistore.api).
#
# Зачем обёртка, а не команда прямо в plist: launchd не наследует PATH и cwd
# рабочей сессии, а @nestjs/config читает `.env` относительно cwd. Значит cwd
# обязан быть apps/api — иначе процесс поднимется без DATABASE_URL и JWT_SECRET.
#
# Что чинит: до 23.07.2026 боевой API запускался вручную как `npm run api` и
# оказывался ДОЧЕРНИМ ПРОЦЕССОМ приложения ChatGPT/Codex (цепочка
# 59978 → 59918 → 59888 → 14785). Перезапуск Codex убивал боевой API. Плюс он
# работал через ts-node — режим разработки. Здесь и то и другое снято: процесс
# принадлежит launchd и запускает собранный dist.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO/apps/api"

# Файл окружения. Сейчас `.env`: полноценный `.env.production` подготовлен, но
# NODE_ENV=production пока не включается — main.ts:13 вызывает
# assertProductionRuntimeReady, который валит старт, пока не зелены все проверки
# production-preflight.ts (не хватает алертов, S3 и транспорта уведомлений).
# Подробности и список блокеров — в шапке apps/api/.env.production.
if [ ! -f .env ]; then
  echo "FATAL: apps/api/.env отсутствует — API поднялся бы без БД и секретов" >&2
  exit 1
fi

# Собранный вход. Молчаливый откат на ts-node здесь недопустим: именно так
# dev-runner когда-то и стал обслуживать боевой трафик.
if [ ! -f dist/main.js ]; then
  echo "FATAL: apps/api/dist/main.js отсутствует — выполните: npm run api:build" >&2
  exit 1
fi

export NODE_PATH=./node_modules
exec node dist/main.js
