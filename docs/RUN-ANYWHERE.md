# Запуск на другом компьютере (Mac mini / любой Mac/Linux)

> Прямого доступа к другой машине у ассистента нет — поэтому вот перенос без публикации
> в интернет + один bootstrap-скрипт. Репозиторий локальный (git-remote нет), переносим
> **git-бандлом** (один файл со всей историей).

## Шаг 1 — перенести код (на ЭТОЙ машине уже сделано)
Бандл собран: `~/Desktop/alistore-erp.bundle` (~2.2 МБ, только исходники, без node_modules).
Скопируй его на другой Mac любым способом: **AirDrop**, USB, или
`scp ~/Desktop/alistore-erp.bundle user@mac-mini.local:~/Desktop/`.
> Пересобрать бандл при новых коммитах: `git bundle create ~/Desktop/alistore-erp.bundle --all`

## Шаг 2 — на ДРУГОМ компьютере: развернуть из бандла
```bash
cd ~/Desktop
git clone alistore-erp.bundle alistore-erp
cd alistore-erp
git checkout codex/open-source-integrations   # рабочая ветка
```

## Шаг 3 — предпосылки (если ещё нет)
```bash
# Homebrew → Node 20+ и PostgreSQL
brew install node postgresql@16
brew services start postgresql@16
```

## Шаг 4 — один скрипт всё поднимает
```bash
./scripts/setup-machine.sh
```
Он: проверит Node/Postgres → создаст роль `alistore` и БД `alistore_dev`/`alistore_test` →
скопирует `apps/api/.env` из примера → `npm install` → миграции+push+сид. Идемпотентно.

## Шаг 5 — запустить (две вкладки терминала)
```bash
npm run api    # API  → http://localhost:4000/api   (Swagger: /api/docs если включён)
npm run web    # Web  → http://localhost:3000
```
Проверка: `npm run api:test` (jest) и `npm run mvp:verify` (сквозная).
Мобильное приложение (Expo): `npm run mobile`.

## Экраны
`/` витрина · `/erp` кокпит владельца · `/pos` касса · `/warehouse` · `/warranty` ·
`/approvals` · `/exchange` · `/staff` · `/ai-tools` · `/admin/products` · `/tg` (Telegram Mini App).

## Включить настоящий AI (LLM)
В `apps/api/.env` добавить `AI_PROVIDER_KEY="sk-or-..."` (OpenRouter) и опц. `AI_MODEL`,
перезапустить `npm run api`. Без ключа работают детерминированные keyless-правила.

## Синхронизация двух машин дальше
Обе машины на одной ветке `codex/open-source-integrations`. Для обмена правками без
интернета: `git bundle create patch.bundle <since>..HEAD` → перенести → `git pull patch.bundle`.
Либо поднять общий remote (GitHub/GitLab) и `git remote add origin … && git push`.

## Если на mac mini есть агент (Codex/Claude Code)
Дай ему прочитать `docs/PARALLEL-LANES.md` + `docs/CODEX-NOW.md` — там его полоса задач.
Гейт для обоих: `npm run api:test` зелёный · `nest build` + `next build` · атомарные коммиты.
