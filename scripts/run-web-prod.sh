#!/usr/bin/env bash
# Точка входа боевой витрины под launchd (агент com.alistore.web).
#
# Что чинит: до 23.07.2026 витрина работала процессом-сиротой (PID 1213, PPID 1),
# запущенным вручную. Супервизора не было — падение оставляло магазин лежать до
# ручного вмешательства. Теперь процессом владеет launchd с KeepAlive.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO/apps/web"

# Прод-сборка Next. Без неё `next start` падает с внятной ошибкой, но лучше
# сказать это здесь и не плодить рестарт-петлю в launchd.
if [ ! -f .next/BUILD_ID ]; then
  echo "FATAL: apps/web/.next отсутствует — выполните: npm run build -w @alistore/web" >&2
  exit 1
fi

# Адрес API для серверной стороны витрины. Клиентские NEXT_PUBLIC_*-значения
# вшиты на этапе сборки; переменная нужна серверным запросам.
export NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-https://api.ali.kg/api}"

exec node "$REPO/node_modules/next/dist/bin/next" start -p 3000
