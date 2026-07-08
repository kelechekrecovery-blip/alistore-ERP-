#!/usr/bin/env bash
# One-shot bootstrap for a fresh Mac/Linux box. Idempotent — safe to re-run.
# Prereqs it does NOT install: Node >=20 and PostgreSQL must already be present
# (macOS: `brew install node postgresql@16 && brew services start postgresql@16`).
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

echo "▸ 1/6  Проверка окружения"
command -v node >/dev/null || { echo "✗ Node не найден. brew install node"; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || { echo "✗ Нужен Node >=20 (сейчас $(node -v))"; exit 1; }
command -v psql >/dev/null || { echo "✗ psql не найден. brew install postgresql@16 && brew services start postgresql@16"; exit 1; }
pg_isready -h localhost -p 5432 >/dev/null 2>&1 || { echo "✗ Postgres не отвечает на localhost:5432. Запусти: brew services start postgresql@16"; exit 1; }
echo "  ✓ Node $(node -v), Postgres доступен"

echo "▸ 2/6  Роль и базы Postgres (alistore / alistore_dev / alistore_test)"
psql -h localhost -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='alistore'" | grep -q 1 \
  || psql -h localhost -d postgres -c "CREATE ROLE alistore LOGIN SUPERUSER;" >/dev/null
for db in alistore_dev alistore_test; do
  psql -h localhost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || psql -h localhost -d postgres -c "CREATE DATABASE $db OWNER alistore;" >/dev/null
  echo "  ✓ $db"
done

echo "▸ 3/6  .env (из примера, если нет)"
[ -f apps/api/.env ] || { cp apps/api/.env.example apps/api/.env; echo "  ✓ apps/api/.env создан (dev-настройки)"; }

echo "▸ 4/6  Установка зависимостей (npm workspaces + mobile)"
npm install
[ -d apps/mobile ] && npm --prefix apps/mobile install >/dev/null 2>&1 || true

echo "▸ 5/6  Схема БД: миграции (dev) + push (test) + сид"
npm run db:migrate -w @alistore/api            # применяет миграции к alistore_dev
TEST_DATABASE_URL="postgresql://alistore@localhost:5432/alistore_test?schema=public" \
  npm --prefix apps/api exec -- prisma db push --skip-generate --accept-data-loss >/dev/null
DATABASE_URL="postgresql://alistore@localhost:5432/alistore_dev?schema=public" \
  npm run db:seed -w @alistore/api

echo "▸ 6/6  Готово."
cat <<'EOF'

  Запуск (в двух вкладках терминала):
    npm run api      # NestJS API → http://localhost:4000/api
    npm run web      # Next.js   → http://localhost:3000
  Проверка целостности:
    npm run api:test      # jest (все сьюты)
    npm run mvp:verify    # сквозная проверка MVP
  Мобильное приложение (Expo):
    npm run mobile

  Экраны: /  /erp  /pos  /warehouse  /warranty  /approvals  /exchange  /staff  /ai-tools  /admin/products  /tg
  Включить настоящий AI (LLM): в apps/api/.env задать AI_PROVIDER_KEY (OpenRouter) [+ AI_MODEL], перезапустить api.
EOF
