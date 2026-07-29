# AliStore — Production Engineering Master Prompt и фазовое ТЗ

Версия: 1.0  
Дата среза: 2026-07-28  
Репозиторий: `/Users/alistore/Desktop/alistore-erp`

> Статус документа: исполнительный prompt и техническое задание.
>
> Этот файл не заменяет `docs/MASTER-PLAN.md`. Генплан остаётся источником
> приоритетов и продуктовых решений. Фазы ниже — способ последовательно исполнить
> его гейты, собрать доказательства и не смешать инфраструктурные, продуктовые и
> внешние задачи.

---

## 1. Назначение

Документ предназначен для инженера или следующей Codex-сессии, которой поручено
довести AliStore до устойчивого публичного production-запуска без потери данных,
ложных заявлений о готовности и опасных автоматических действий.

Он содержит:

- готовый master-prompt;
- зафиксированный baseline;
- правила безопасности и источники истины;
- карту зависимостей;
- подробное ТЗ по фазам;
- автоматические и ручные критерии приёмки;
- rollback и stop conditions;
- формат доказательств и финального отчёта.

Главный результат программы: четыре приложения Client, Staff, Courier и POS
работают с одним production API, а критические операции заказа, склада, денег,
доставки и возврата доказуемо согласованы в PostgreSQL и Event Ledger.

---

## 2. Иерархия источников истины

При конфликте руководствоваться источниками в таком порядке:

1. `AGENTS.md` и активные системные инструкции.
2. PostgreSQL, Prisma migrations и append-only Event Ledger — бизнес-истина.
3. `docs/MASTER-PLAN.md` — приоритеты, гейты и решения владельца.
4. Реальные ответы production/staging API и результаты текущих тестов.
5. `docs/PRODUCTION-ACTIVATION.md`, `docs/READINESS.md`,
   `docs/OWNER-LAUNCH-CHECKLIST.md`, `docs/GO-LIVE-RUNBOOK.md`.
6. `apps/ios/store/release-runbook.md` и App Store Connect API.
7. Этот документ — порядок исполнения, но не право переписывать бизнес-истину.
8. Старые файлы с пометкой `SUPERSEDED` — только исторический контекст.

Нельзя восстанавливать старое утверждение только потому, что оно написано в
документе. Любой статус «готово» должен подтверждаться новым прогоном.

---

## 3. Подтверждённый baseline

Срез ниже получен фактическими прогонами 2026-07-28:

| Область | Подтверждённое состояние |
|---|---|
| App Store | Client, Staff, Courier и POS версии `1.0.0` находятся в `WAITING_FOR_REVIEW` |
| Release mode | У всех четырёх `AFTER_APPROVAL` |
| iOS unit/contract | 147/147 тестов |
| iOS UI | 46/46 сценариев: Client 27, Staff 11, Courier 3, POS 5 |
| iOS build | Все четыре target собираются |
| API isolated regression | 235/235 suites, 1384/1384 tests |
| Cloudflare/API contract | 8/8 тестов |
| Public API | `/health`, `/health/live`, `/health/ready`, каталог — HTTP 200 |
| Review access | Все четыре review-входа — HTTP 201 и действующий token |
| Production preflight | 12 проверок ready, 4 блокера |
| Redis | Локальный Redis активен, loopback runtime принят preflight |
| R2 | Существуют `alistore-media-prod` и `alistore-backups-prod` |
| Outbox | 57 pending: 43 push и 14 SMS |
| Runtime | Публичный API пока использует временный non-production escape hatch |

Оставшиеся production-блокеры:

1. SMTP production delivery.
2. Telegram critical alerting.
3. Настоящие R2/S3 credentials и включение signed media storage.
4. Outbox relay, который нельзя включать до настройки push/SMS-провайдера и
   разбора накопленной очереди.

Baseline не означает, что реальные платежи, APNs/FCM, SMS, фискальный чек,
физический принтер, терминал и восстановление из production R2 уже
сертифицированы.

---

## 4. Внешние входы, которые нельзя выдумывать

| Вход | Владелец | Зачем | Что считается достаточным |
|---|---|---|---|
| SMTP credentials | Владелец бизнеса | Email OTP и транзакционная почта | Проверенный sender, SPF/DKIM/DMARC, успешная доставка |
| Telegram bot token + chat ID | Владелец | Critical alerts | Тестовый alert и recovery alert в закрытой группе |
| R2 access key + secret | Cloudflare owner | Evidence и backup | Token ограничен нужным bucket |
| APNs/FCM/Novu config | Apple/Google/владелец | Push | Доставка на физический iPhone |
| SMS provider credentials | Владелец/оператор | Customer OTP | Доставка на основные операторы КР |
| ОФД/ККМ договор и API | Владелец/бухгалтер | Законный фискальный чек | Чек с QR и сверка с налоговой |
| Платёжный провайдер | Владелец/банк | Онлайн-оплата и возврат | Live intent, webhook, replay, refund reconciliation |
| POS hardware | Магазин | Сканер, принтер, терминал | Физический приёмочный прогон |

Если вход отсутствует:

- не создавать фиктивный credential;
- не ставить `*_CERTIFIED=true`;
- не ослаблять preflight;
- не включать relay, который пометит сообщение отправленным;
- продолжать независимые работы и фиксировать блокер владельца.

---

## 5. Master prompt

Скопируйте блок ниже в новую инженерную сессию.

```text
Ты — ведущий production engineer AliStore. Работай в репозитории
/Users/alistore/Desktop/alistore-erp и исполняй
docs/PRODUCTION-ENGINEERING-MASTER-PROMPT.md по фазам.

ЦЕЛЬ
Довести Client, Staff, Courier и POS до доказуемо устойчивого публичного
production-запуска с серверной истиной по деньгам, складу, статусам и ownership.

ИСТОЧНИКИ ИСТИНЫ
1. AGENTS.md и системные инструкции.
2. PostgreSQL + Prisma migrations + append-only Event Ledger.
3. docs/MASTER-PLAN.md.
4. Фактические ответы API и свежие результаты тестов.
5. Этот документ как процедура исполнения.

ОБЯЗАТЕЛЬНЫЕ ИНВАРИАНТЫ
- Не доверяй customerId, staffId, actor, paid, approved, delivered, stock status
  и isDemo из клиентского запроса.
- Деньги и склад рассчитывает сервер.
- Offline mutation сохраняет стабильный Idempotency-Key.
- Повторный запрос, webhook или tap не создаёт второе бизнес-действие.
- Любая денежная, складская и статусная операция оставляет Event Ledger evidence.
- Не публикуй секреты в Git, логах, выводе tools или документации.
- Не удаляй и не перезаписывай чужие изменения в dirty worktree.
- Не запускай destructive DB cleanup против общей dev/prod базы.
- Для API regression используй только npm run api:test:isolated.
- Не включай outbox relay без готового провайдера и аудита pending-сообщений.
- Не включай NODE_ENV=production, пока launch:check не зелёный.
- Не меняй App Store submission и release mode без отдельного запроса владельца.
- Не подменяй отсутствие внешнего договора кодовой заглушкой.

ПРОТОКОЛ КАЖДОЙ ФАЗЫ
1. Прочитай цель, зависимости, stop conditions и acceptance.
2. Сними baseline до правок.
3. Определи автоматический validation gate.
4. Сначала добавь или уточни регрессионный тест.
5. Сделай минимальный связный patch.
6. Выполни targeted gate, затем phase gate.
7. Проведи security и silent-failure review.
8. Проверь живой runtime, если фаза меняет deployment.
9. Запиши evidence: команды, exit code, счётчики и артефакты.
10. Не переходи к зависимой фазе при красном gate.

ОТЧЁТ ПОСЛЕ КАЖДОЙ ФАЗЫ
- Результат.
- Изменённые файлы.
- Пройденные проверки с точными счётчиками.
- Ручная проверка.
- Оставшиеся риски.
- Rollback.
- Следующая разблокированная фаза.

НАЧАЛО
Начни с Phase 0. Не повторяй уже подтверждённые действия без причины:
сначала проверь, не изменился ли baseline. При расхождении фактическое состояние
важнее цифр этого документа.
```

---

## 6. Общий протокол исполнения

### 6.1 Статусы фаз

- `NOT_STARTED` — работа не начиналась.
- `IN_PROGRESS` — есть активная задача, но acceptance ещё не пройден.
- `BLOCKED_OWNER` — нужен внешний credential, договор или решение.
- `BLOCKED_ENGINEERING` — красный тест или неизвестный дефект.
- `READY_FOR_ACCEPTANCE` — автоматические gates зелёные, нужна ручная проверка.
- `ACCEPTED` — автоматические и ручные критерии выполнены, evidence записан.

### 6.2 Правило завершения

Фаза считается принятой только если:

- все обязательные artifacts существуют;
- автоматические команды завершились с exit code 0;
- ручные пункты имеют имя проверившего и timestamp;
- stop conditions отсутствуют;
- rollback проверен или документирован;
- нерешённые риски не маскируются словом «готово».

### 6.3 Формат evidence

Для каждой фазы создать запись:

```markdown
## Phase N acceptance — YYYY-MM-DD

- Commit/worktree: <hash или dirty-worktree note>
- Environment: local | isolated-test | staging | production
- Commands:
  - `<command>` → exit 0, <counts>
- Live probes:
  - `<URL/operation>` → <status>, <safe summary>
- Manual checks:
  - <check> — <operator>, <timestamp>
- Data reconciliation:
  - <business id> → <result>
- Rollback:
  - <tested action/result>
- Remaining risks:
  - <risk or none>
- Verdict: ACCEPTED | BLOCKED
```

Секреты, OTP, телефоны, email, payment identifiers и персональные данные в
evidence не копировать.

---

## 7. Карта зависимостей

| Фаза | Название | Зависит от | Может идти параллельно |
|---:|---|---|---|
| 0 | Controlled baseline | — | — |
| 1 | Production config boundary | 0 | 2, 3 |
| 2 | R2 evidence storage | 0 | 1, 3 |
| 3 | SMTP, alerting, push и SMS | 0 | 1, 2 |
| 4 | Outbox recovery | 3 | финал 2 |
| 5 | Production runtime cutover | 1, 2, 3, 4 | — |
| 6 | Four-app ecosystem E2E | 5 | часть 9 |
| 7 | Money, stock и Ledger reconciliation | 6 | — |
| 8 | Backup, restore и disaster recovery | 2, 5 | 9 |
| 9 | Observability и incident response | 3, 5 | 8 |
| 10 | Security, privacy, legal и fiscal | 5, 7 | 8, 9 |
| 11 | Performance и resilience | 6, 8, 9 | 10 |
| 12 | App Store review и public release | 5, 6, 7, 9, критические пункты 10 | — |
| 13 | Post-launch product improvements | 12 | — |

Фазы 1–3 можно начинать параллельно, но Phase 5 запрещена, пока каждая не имеет
acceptance или явно утверждённого безопасного исключения владельца.

---

# Phase 0 — Controlled baseline

## Цель

Получить воспроизводимую отправную точку, не повредить dirty worktree и отделить
дефекты кода от загрязнения общей базы или устаревших документов.

## Входы

- Текущий worktree.
- `docs/MASTER-PLAN.md`.
- `docs/READINESS.md`.
- App Store submission status.
- Доступ к isolated PostgreSQL test harness.

## Задачи

1. Снять `git status --short`.
2. Классифицировать изменения: пользовательские, текущей задачи, generated.
3. Не восстанавливать и не удалять неизвестные изменения.
4. Проверить package scripts и фактические пути проектов.
5. Запустить API regression только через isolated harness.
6. Запустить API build и Cloudflare contract checks.
7. Проверить четыре iOS target, unit и UI suite.
8. Снять безопасный live probe public API.
9. Проверить четыре review-login без вывода credentials.
10. Сверить App Store states read-only.
11. Зафиксировать расхождения между документами и фактом.

## Artifacts

- Baseline evidence.
- Список dirty files с ownership note.
- Список актуальных blockers.
- Таблица версий runtime/toolchain.

## Автоматический gate

```bash
git diff --check
npm run api:check
npm run api:test:isolated
npm run api:build
npm run ios:build
npm run ios:test
npm run ios:ui
```

## Ручной gate

- Убедиться, что ни одна команда не работала против production DB.
- Убедиться, что UI tests использовали fixture/UITest mode.
- Проверить, что секреты отсутствуют в сохранённом выводе.

## Stop conditions

- Неизвестная destructive migration.
- Общая DB указана как test target.
- Красный isolated suite.
- Worktree содержит конфликтующие изменения в затрагиваемых файлах.

## Acceptance

- Isolated API suite зелёный.
- Все четыре iOS target собираются.
- Review access и live health подтверждены.
- Baseline записан с timestamp.

## Rollback

Фаза read-only. Если диагностика создала временные isolated DB/artifacts, удалить
только созданные этой фазой ресурсы по их точным идентификаторам.

---

# Phase 1 — Production configuration boundary

## Цель

Разделить development, test, staging и production так, чтобы production никогда
не подхватывал dev-secret или unsafe default.

## Зависимости

Phase 0 accepted.

## Задачи

1. Проверить `resolveRuntimeEnvFiles`.
2. Production загружает только:
   - `.env.production.local`;
   - `.env.production`;
   - process environment.
3. Test не загружает production secrets.
4. Добавить `_FILE`/secret-manager strategy для deployment, если платформа это
   поддерживает.
5. Удалить необходимость `ALLOW_NON_PRODUCTION_PUBLIC_HOST`.
6. Проверить exact CORS и allowed hosts.
7. Проверить `AUTH_OTP_DEV_ECHO=false`.
8. Проверить `API_DOCS_ENABLED=false`.
9. Установить явные:
   - `PROCESS_ROLE`;
   - `PUBLIC_DEMO_MODE`;
   - `PAYMENT_PROVIDER`;
   - `REFUND_RELAY_ENABLED`;
   - `JOB_BACKEND`;
   - scheduler flags.
10. Не переносить секреты копированием в tracked files.
11. Добавить preflight regression на каждый unsafe default.

## Artifacts

- Production env key inventory без значений.
- Регрессионные тесты выбора env files.
- Production preflight report.
- Rollback copy текущей runtime-конфигурации в защищённом месте.

## Автоматический gate

```bash
npm run test -w @alistore/api -- --runInBand \
  test/runtime-env-files.spec.ts \
  test/production-preflight.spec.ts \
  test/production-mode-guard.spec.ts \
  test/runtime-security.spec.ts
npm run api:build
```

## Ручной gate

- Проверить, что process environment имеет приоритет над env file.
- Проверить, что production secrets не появились в `git status`.
- Проверить, что error report перечисляет только имена отсутствующих env.

## Stop conditions

- Production запускается с `.env`.
- Preflight можно обойти одной заглушкой.
- Секрет отображается в логах или diff.
- Переход в production роняет review access без rollback.

## Acceptance

- Production config изолирован.
- `launch:check` красный только по реальным внешним зависимостям.
- Dev и test продолжают запускаться.

## Rollback

- Вернуть прежний launch configuration.
- Перезапустить API.
- Проверить `/health/ready` и четыре review-login.

---

# Phase 2 — R2 evidence и media storage

## Цель

Перевести чувствительные фотографии и документы с публичного локального диска в
закрытый R2/S3 bucket с короткоживущими signed URLs.

## Зависимости

- Phase 0 accepted.
- Постоянный R2 credential от владельца.
- Bucket `alistore-media-prod`.

## Задачи

1. Создать отдельный R2 token только для media bucket.
2. Настроить:
   - `MEDIA_STORAGE=s3`;
   - `S3_ENDPOINT`;
   - `S3_REGION`;
   - `MINIO_BUCKET`;
   - `MINIO_ROOT_USER`;
   - `MINIO_ROOT_PASSWORD`;
   - `EVIDENCE_SIGNED_URL_TTL_SECONDS`.
3. Не использовать временный credential для постоянного production.
4. Проверить upload, HEAD/read, signed URL, expiry и delete.
5. Проверить MIME/type validation и image transformation.
6. Проверить compensation queue при DB failure после upload.
7. Проверить cleanup retry при R2 outage.
8. Инвентаризировать существующие локальные objects.
9. Разделить public product media и private evidence policy.
10. Перенести private evidence с checksum verification.
11. Запретить public static access к private uploads.
12. Настроить lifecycle и retention по типу evidence.
13. Проверить backup policy для R2 metadata/object inventory.

## Artifacts

- R2 configuration inventory без secret values.
- Migration manifest: object key, size, checksum, destination, result.
- Evidence access test.
- Retention matrix.
- Cleanup/compensation test evidence.

## Автоматический gate

```bash
npm run test -w @alistore/api -- --runInBand \
  src/media/media-cleanup.service.spec.ts \
  test/media.spec.ts \
  test/media-cleanup.e2e-spec.ts \
  test/evidence-retention.spec.ts \
  test/evidence.e2e-spec.ts \
  test/backup-to-s3.spec.ts
npm run api:test:isolated
npm run api:build
```

## Ручной gate

- Unsigned request к private evidence отклонён.
- Signed URL открывает объект.
- URL перестаёт работать после TTL.
- Удалённый объект не восстанавливается публичным cache.
- R2 outage не теряет DB compensation task.

## Stop conditions

- Bucket/token имеет доступ ко всему Cloudflare account.
- Evidence доступен по постоянному public URL.
- Migration не проверяет checksum.
- Local source удаляется до сверки destination.

## Acceptance

- `media_storage` ready в production preflight.
- Private evidence выдаётся только signed URL.
- Migration и rollback доказаны на staging sample.

## Rollback

- Переключить read path на старое storage только при сохранённых local objects.
- Не удалять R2 objects во время rollback.
- Сохранить migration manifest для повторного запуска.

---

# Phase 3 — SMTP, alerting, push и SMS

## Цель

Подключить реальные каналы доставки, не допуская silent-log fallback и ложного
статуса `sent`.

## Зависимости

- Phase 0 accepted.
- Credentials владельца по каждому каналу.

## Workstream A — SMTP

1. Выбрать transactional provider.
2. Настроить отдельный sender domain.
3. Настроить SPF, DKIM и DMARC.
4. Заполнить SMTP env.
5. Проверить `verify()` и реальную доставку.
6. Проверить email OTP:
   - request;
   - expiry;
   - wrong code;
   - one-time use;
   - throttle;
   - attach email;
   - taken address.
7. Проверить bounce/error handling.
8. Запретить JSON transport в production.

## Workstream B — Telegram critical alerting

1. Создать отдельного бота.
2. Добавить его в закрытую incident-группу.
3. Настроить alert token и chat ID.
4. Проверить 5xx alert.
5. Проверить dedup/suppression.
6. Проверить recovery notification.
7. Убедиться, что alert не содержит PII/secrets.

## Workstream C — Push

1. Определить фактический token type iOS-клиента:
   APNs device token, FCM registration token или provider token.
2. Не отправлять APNs token через несовместимый FCM flow.
3. Настроить APNs/FCM/Novu credentials.
4. Проверить device registration, refresh и logout removal.
5. Проверить foreground/background/terminated delivery.
6. Проверить deep link ownership.
7. Проверить несколько устройств одного пользователя.
8. Проверить revoked staff/courier session.

## Workstream D — SMS

1. Выбрать production A2P provider для операторов КР.
2. Зарегистрировать sender ID.
3. Настроить provider credentials.
4. Проверить Beeline, Mega и O!.
5. Проверить throttle, expiry, replay и provider outage.
6. OTP никогда не возвращать в response или log.
7. После live test выставлять certification только с evidence.

## Artifacts

- Provider matrix.
- DNS evidence для SMTP.
- Physical-device push evidence.
- SMS delivery matrix.
- Alert/recovery screenshots без секретов.
- Updated external readiness.

## Автоматический gate

```bash
npm run test -w @alistore/api -- --runInBand \
  test/smtp-email-otp.sender.spec.ts \
  test/auth-email-otp.e2e-spec.ts \
  test/alerter.spec.ts \
  test/critical-alert.e2e-spec.ts \
  test/channel-transport.spec.ts \
  test/fcm-push-transport.spec.ts \
  test/expo-push-transport.spec.ts \
  test/notifications-push-tokens.spec.ts \
  test/otp-sender-selector.spec.ts \
  test/otp-sender.spec.ts
npm run api:test:isolated
```

## Ручной gate

- Email доставлен минимум на два независимых домена.
- Critical alert и recovery alert доставлены.
- Push доставлен на физический iPhone.
- SMS доставлен на основные операторы.
- Logout блокирует дальнейшие персональные push.

## Stop conditions

- Provider работает только через dev echo.
- Канал без credential помечает message как sent.
- Push открывает чужой order.
- OTP виден в API response production.
- Для production используется личный sender без согласования владельца.

## Acceptance

- `email_otp_delivery` и `critical_alerting` ready.
- Есть хотя бы один production-capable push путь.
- SMS либо certified, либо честно disabled.
- Silent fallback невозможен.

## Rollback

- Выключить конкретный transport.
- Оставить сообщения pending/retryable.
- Не переводить неотправленные сообщения в sent.

---

# Phase 4 — Outbox recovery

## Цель

Безопасно обработать накопленные сообщения и включить relay без устаревших SMS,
ложных push и потери retry semantics.

## Зависимости

- Phase 3 accepted для нужных каналов.
- Предпочтительно Phase 2 accepted.

## Исходные данные

На baseline: 57 pending, из них 43 push и 14 SMS.

## Задачи

1. Сделать read-only snapshot очереди.
2. Сгруппировать по:
   - channel;
   - template;
   - age;
   - recipient ownership;
   - связанной business entity;
   - attempts.
3. Определить expiry policy по template.
4. OTP и временные коды не отправлять после expiry.
5. Старый `order_ready` не отправлять после delivered/cancelled.
6. Проверить текущего владельца order/ticket.
7. Ввести `expired`/`superseded` outcome, если модель его ещё не выражает.
8. Сделать dry-run классификации.
9. Включить relay на canary batch 3–5 сообщений.
10. Проверить provider response и пользовательский результат.
11. Выпускать небольшими партиями.
12. Контролировать retry/backoff/DLQ.
13. Проверить worker heartbeat.
14. Только после успеха установить постоянный relay mode.

## Artifacts

- Snapshot counts без recipients.
- Template expiry policy.
- Dry-run report.
- Canary report.
- Final reconciliation: pending/sent/failed/expired/superseded.

## Автоматический gate

```bash
npm run test -w @alistore/api -- --runInBand \
  src/outbox/outbox.relay.spec.ts \
  src/outbox/outbox.service.spec.ts \
  test/outbox-resilience.e2e-spec.ts \
  test/outbox.e2e-spec.ts \
  test/transactional-notifications.e2e-spec.ts \
  test/notification-coverage.e2e-spec.ts
npm run api:test:isolated
```

## Ручной gate

- Canary messages дошли правильным получателям.
- Ни одно устаревшее сообщение не отправлено.
- Provider outage оставляет message retryable.
- Dashboard counts совпадают с DB counts.

## Stop conditions

- Нет expiry policy.
- Recipient ownership нельзя доказать.
- Transport использует log fallback.
- Canary создаёт жалобу, дубль или неверный deep link.

## Acceptance

- Очередь разобрана без потери истории.
- `OUTBOX_RELAY_ENABLED=true`.
- Старейшее рабочее сообщение не старше установленного SLO.
- `outbox_relay` ready.

## Rollback

- Остановить relay.
- Не удалять pending/retry records.
- Сохранить snapshot и canary identifiers.

---

# Phase 5 — Production runtime cutover

## Цель

Перевести public API из временного режима в fail-closed production без
продолжительного простоя и без потери App Review access.

## Зависимости

Phases 1–4 accepted.

## Задачи

1. Снять текущую runtime configuration и process state.
2. Выполнить полный `launch:check`.
3. Проверить migration status.
4. Сделать свежий backup.
5. Проверить rollback command.
6. Установить `NODE_ENV=production`.
7. Удалить `ALLOW_NON_PRODUCTION_PUBLIC_HOST`.
8. Перезапустить API контролируемо.
9. Проверить:
   - live;
   - ready;
   - catalog;
   - Client login;
   - Staff login;
   - Courier login;
   - POS login.
10. Проверить scheduler/relay/Redis heartbeat.
11. Проверить logs на secret/PII.
12. Проверить Cloudflare tunnel и host header.
13. Провести минимум 30 минут усиленного наблюдения.

## Artifacts

- Green launch report.
- Pre-cutover backup identifier.
- Runtime diff без values.
- Probe report.
- Rollback result или подтверждённая команда.

## Автоматический gate

```bash
npm run launch:check
npm run api:test:isolated
npm run api:build
npm run security:secrets
```

Safe live probes:

```bash
curl -fsS https://api.ali.kg/api/health/live
curl -fsS https://api.ali.kg/api/health/ready
curl -fsS https://api.ali.kg/api/catalog/products
```

## Ручной gate

- Review accounts работают.
- Нет `ALLOW_NON_PRODUCTION_PUBLIC_HOST`.
- API автоматически возвращается после controlled restart.
- Нет новых 5xx и растущей очереди.

## Stop conditions

- `launch:check` не зелёный.
- Нет свежего backup.
- Нет rollback.
- Review login сломан.
- Ready probe нестабилен.

## Acceptance

- Public API работает в production mode.
- Escape hatch удалён.
- Все четыре приложения продолжают ключевые read/login flows.

## Rollback

1. Вернуть предыдущую runtime configuration.
2. Перезапустить API.
3. Проверить ready и review-login.
4. Не откатывать data migration назад; использовать forward fix.

---

# Phase 6 — Four-app ecosystem E2E

## Цель

Доказать один полный business flow через Client → Staff → Courier/POS → API, а не
только независимую работу экранов.

## Зависимости

Phase 5 accepted.

## Сценарий A — Client order

1. Авторизация.
2. Каталог и product detail.
3. Cart.
4. Stock cap.
5. Promotion quote.
6. Delivery/pickup options.
7. Order creation.
8. Повторный tap с тем же idempotency key.
9. Order history/timeline.
10. Support/return entry.

## Сценарий B — Staff fulfillment

1. Новый order виден сотруднику с нужной ролью.
2. Чужая роль получает 403.
3. Reserve/pick/pack transitions.
4. Inventory evidence.
5. Pickup или courier assignment.
6. Event Ledger содержит actor и transitions.

## Сценарий C — Courier COD

1. Courier видит только назначенный route.
2. Offline command сохраняет stable key.
3. Delivery evidence upload.
4. Full/partial/failed delivery.
5. COD handover.
6. Replay после restart не дублирует деньги.

## Сценарий D — POS

1. Shift open.
2. Product scan/search.
3. Quantity/IMEI.
4. Discount approval.
5. Cash/card/QR/split according to configured provider.
6. Sale submit и retry.
7. Server receipt.
8. Return/exchange.
9. Shift close и reconciliation.

## Сценарий E — Failure matrix

- timeout;
- double tap;
- duplicated webhook;
- reordered webhook;
- app kill during sync;
- Redis outage;
- provider outage;
- network restoration;
- revoked staff;
- expired customer token;
- cross-customer IDOR.

## Artifacts

- Один trace ID/business order ID.
- Cross-surface timeline.
- Screenshots/xcresult/playwright traces.
- DB/Event Ledger reconciliation.
- Failure matrix report.

## Автоматический gate

```bash
npm run ecosystem:e2e
npm run ecosystem:verify
npm run ios:test
npm run ios:ui
npm run api:test:isolated
```

## Ручной gate

- Физический iPhone.
- Реальная камера/location permission.
- Проверка offline/online transition.
- Проверка роли каждого приложения.

## Stop conditions

- Любая поверхность рассчитывает финальную сумму самостоятельно.
- Повтор создаёт второй order/payment/sale.
- Courier видит чужой route.
- Staff action не оставляет Ledger event.

## Acceptance

- Один сквозной order завершён.
- Все failure cases имеют ожидаемый outcome.
- Нет финансовых/складских дублей.

## Rollback

E2E выполняется на отдельном tenant/test dataset. Production mutations допускаются
только как заранее согласованный минимальный smoke с обратимой операцией.

---

# Phase 7 — Money, stock и Ledger reconciliation

## Цель

Математически доказать согласованность денег, склада и событий для ключевых
бизнес-процессов.

## Зависимости

Phase 6 accepted.

## Инварианты

1. Сумма order lines = order total после server quote.
2. Payment allocations не превышают total.
3. Refund allocations не превышают settled amount.
4. Cash movement соответствует shift и tender.
5. Inventory quantity/IMEI меняется ровно один раз.
6. COGS и valuation используют authoritative stock data.
7. COD handover согласован с courier run.
8. Journal сохраняет двойную запись.
9. Каждая операция имеет Ledger event.
10. Replay не создаёт вторую проводку.

## Задачи

1. Создать reconciliation query/report по business ID.
2. Проверить:
   - prepaid order;
   - COD;
   - POS cash;
   - split tender;
   - refund;
   - exchange;
   - gift card/loyalty;
   - procurement receiving;
   - consignment payout.
3. Проверить boundary по business day/timezone.
4. Проверить rounding в minor units.
5. Проверить concurrency/race.
6. Проверить cancellation compensation.
7. Проверить quarantine после return.
8. Получить бухгалтерскую ручную сверку для фискальных/налоговых строк.

## Artifacts

- Reconciliation report.
- SQL/check script в read-only режиме.
- Таблица expected/actual.
- Accountant sign-off для применимых flows.

## Автоматический gate

```bash
npm run ecosystem:e2e
npm run ecosystem:verify
npm run api:test:isolated
npm run inventory:valuation:benchmark
```

Дополнительно targeted suites:

```bash
npm run test -w @alistore/api -- --runInBand \
  test/reports-money-truth.e2e-spec.ts \
  test/payments-race.e2e-spec.ts \
  test/refund-aggregate.e2e-spec.ts \
  test/inventory-valuation-reconciliation.e2e-spec.ts \
  test/cancel-compensation.e2e-spec.ts
```

## Stop conditions

- Любое необъяснённое расхождение больше нуля.
- Journal не сбалансирован.
- Stock и Ledger расходятся.
- Reconciliation требует ручной правки DB.

## Acceptance

- Все перечисленные flows сходятся.
- Read-only report воспроизводим.
- Повторный прогон даёт тот же результат.

## Rollback

Не исправлять финансовую историю прямым UPDATE. Использовать compensation,
reversal или forward correction с actor и Ledger event.

---

# Phase 8 — Backup, restore и disaster recovery

## Цель

Доказать восстановление бизнеса после потери API-host, DB или storage.

## Зависимости

Phases 2 и 5 accepted.

## Задачи

1. Настроить encrypted PostgreSQL backup.
2. Писать backup в `alistore-backups-prod`.
3. Настроить retention:
   - daily;
   - weekly;
   - monthly.
4. Проверять dump integrity до upload success.
5. Проверять checksum после download.
6. Восстанавливать в новую DB.
7. Выполнять read-only integrity verification:
   - migrations;
   - triggers;
   - ledger;
   - double entry;
   - critical table counts.
8. Проверить R2 object inventory.
9. Документировать RPO/RTO.
10. Провести API host loss drill.
11. Провести Redis loss/rebuild drill.
12. Провести rollback release artifact.

## Artifacts

- Backup job evidence.
- Restore drill report.
- RPO/RTO measurement.
- Object inventory.
- Rollback runbook.

## Автоматический gate

```bash
npm run release:gate
npm run d1:restore:drill
npm run api:test:isolated
```

Если активен PostgreSQL backup path, использовать его штатные scripts из
`ops/`/`scripts/`, не придумывая новый dump format.

## Ручной gate

- Restore выполнен из production R2 bucket, не из локального MinIO.
- Восстановленная DB открывается read-only verifier.
- Случайный production resource не затронут.

## Stop conditions

- Backup существует, но restore не проверен.
- Restore использует ту же DB.
- Dump содержит секреты в evidence.
- Retention может удалить единственную годную копию.

## Acceptance

- Уложились в утверждённые RPO/RTO.
- DB и R2 references согласованы.
- Rollback runbook воспроизводим другим инженером.

## Rollback

Drill использует отдельные точные resource IDs. После завершения удаляются только
ресурсы drill, никогда production bucket/database.

---

# Phase 9 — Observability и incident response

## Цель

Сделать ошибки видимыми до обращения клиента и дать дежурному понятный runbook.

## Зависимости

Phases 3 и 5 accepted.

## SLO

Предлагаемый начальный набор:

- API availability ≥ 99.9%.
- Catalog p95 < 500 ms.
- Critical command p95 < 1 s без provider latency.
- Старейшее рабочее outbox message < 5 минут.
- Backup freshness < 24 часов.
- Ноль необъяснённых financial reconciliation errors.

## Метрики

- live/ready uptime;
- 4xx/5xx rate;
- p50/p95/p99 latency;
- DB connections и slow queries;
- Redis/BullMQ health;
- outbox depth/age/retries/DLQ;
- scheduler heartbeat;
- R2 errors;
- OTP delivery latency;
- push/SMS provider errors;
- App Store/API version distribution;
- orders stuck by state age;
- shifts open too long;
- courier runs not reconciled.

## Задачи

1. Настроить uptime checks.
2. Подключить Sentry/error aggregation.
3. Добавить redaction PII/secrets.
4. Настроить Telegram alerts.
5. Создать alert dedup и recovery.
6. Создать dashboard.
7. Создать runbook на каждый critical alert.
8. Провести synthetic 5xx.
9. Провести DB/Redis/R2 outage drills.
10. Проверить отсутствие alert storm.

## Artifacts

- Dashboard links/exports.
- Alert matrix.
- Incident runbooks.
- Drill evidence.
- SLO baseline.

## Автоматический gate

```bash
npm run test -w @alistore/api -- --runInBand \
  test/alerter.spec.ts \
  test/critical-alert.e2e-spec.ts \
  test/error-reporter.spec.ts \
  test/observability-alerts.spec.ts \
  test/observability-status.e2e-spec.ts \
  test/health.e2e-spec.ts
```

## Stop conditions

- Critical alert не доставляется или не содержит данных для диагностики.
- Alert или dashboard раскрывает PII, credentials либо платёжные данные.
- Synthetic failure неотличим от нормального состояния системы.
- Alert storm мешает определить первичную причину инцидента.

## Acceptance

- Ошибка обнаруживается автоматически.
- Alert содержит actionable context без PII.
- Recovery также виден.
- Дежурный может исполнить runbook.

## Rollback

Отключить шумное правило, не отключая весь monitoring. Сохранить incident history.

---

# Phase 10 — Security, privacy, legal и fiscal

## Цель

Закрыть технические и юридические условия публичной торговли и обработки данных.

## Workstream A — Security

1. Secret scan.
2. Dependency scan.
3. JWT/session rotation.
4. IDOR и tenant isolation.
5. Staff revocation.
6. RBAC/Casbin consistency.
7. Rate limits.
8. Host/CORS/proxy validation.
9. File upload validation.
10. Audit dangerous actions.

## Workstream B — Privacy

1. Data inventory.
2. Purpose/retention matrix.
3. Customer export/delete.
4. Consent versioning.
5. Passport/evidence access.
6. Log redaction.
7. App Privacy соответствие фактическому поведению.

## Workstream C — Legal

1. Публичная оферта.
2. Политика ПДн.
3. Согласие на evidence/passport.
4. Return/warranty terms.
5. Проверка юристом КР.

## Workstream D — Fiscal

1. Выбрать ОФД/ККМ.
2. Подключить provider port.
3. Issue receipt.
4. Fiscal QR/number.
5. Return/exchange fiscal operation.
6. Z-report.
7. Offline queue.
8. Tax authority reconciliation.
9. Только после этого `FISCAL_*_CERTIFIED=true`.

## Artifacts

- Threat model.
- Privacy inventory/retention.
- Legal sign-off.
- Fiscal certification evidence.
- Security scan reports.

## Автоматический gate

```bash
npm run security:secrets
npm run security:dependencies
npm run api:test:isolated
npm run ecosystem:verify
```

## Ручной gate

- Юрист/бухгалтер подтвердили применимые документы и чек.
- Физический fiscal receipt сверяется с ОФД/налоговой.
- App Privacy не расходится с runtime.

## Stop conditions

- Фискализация объявлена готовой без live receipt.
- Privacy label скрывает фактически собираемые данные.
- Security scan содержит unresolved critical.

## Acceptance

- Нет unresolved critical security findings.
- Legal/fiscal owner sign-off приложен.
- Privacy behavior и store declaration совпадают.

## Rollback

Юридические и финансовые записи не удалять. Ошибочный релиз отключать feature
flag/forward fix с сохранением audit trail.

---

# Phase 11 — Performance и resilience

## Цель

Доказать, что система выдерживает ожидаемую нагрузку и корректно деградирует.

## Зависимости

Phases 6, 8 и 9 accepted.

## Задачи

1. Зафиксировать capacity assumptions.
2. Измерить catalog/search/checkout/POS latency.
3. Нагрузить read и command paths отдельно.
4. Проверить DB pool.
5. Проверить N+1 и slow SQL.
6. Проверить queue concurrency.
7. Проверить rate limits.
8. Проверить process restart.
9. Проверить Redis outage.
10. Проверить R2/provider timeout.
11. Проверить app offline replay.
12. Определить graceful degradation.

## Artifacts

- Load profile.
- p50/p95/p99 report.
- Resource graphs.
- Bottleneck list.
- Capacity recommendation.

## Автоматический gate

```bash
npm run perf:smoke
npm run inventory:valuation:benchmark
npm run api:test:isolated
```

## Stop conditions

- Нагрузочный профиль повреждает или загрязняет production-данные.
- При retry/timeout появляется duplicate mutation.
- p95/p99 превышают согласованный SLO без документированного capacity plan.
- Отказ Redis, R2 или внешнего провайдера повреждает authoritative state.

## Acceptance

- SLO выполнены.
- Нет duplicate mutation при timeout/retry.
- Outage не повреждает authoritative state.

## Rollback

Каждую performance-оптимизацию выпускать отдельно с возможностью вернуть прежний
query/worker setting без отката данных.

---

# Phase 12 — App Store review и public release

## Цель

Сопроводить четыре уже отправленные версии до review, автоматического релиза и
стабильного post-launch периода.

## Зависимости

- Phase 5 accepted.
- Phase 6 и 7 accepted.
- Phase 9 accepted.
- Критические security/privacy/legal пункты Phase 10 accepted.

## Задачи до решения Apple

1. Ежедневно проверять submission state read-only.
2. Ежедневно проверять четыре review-login.
3. Не раскрывать credentials в evidence.
4. Следить за App Review messages.
5. Отвечать на вопросы:
   - отсутствие self-registration для staff apps;
   - location;
   - delivery photos;
   - COD;
   - role-based access;
   - review data isolation.
6. Контролировать `AUTH_REVIEW_UNTIL`.
7. Не менять release mode без владельца.
8. Не создавать новую build/version без причины.

## Задачи после approval

1. Зафиксировать `READY_FOR_SALE`/эквивалент.
2. Проверить storefront availability.
3. Выполнить clean install.
4. Проверить login/catalog/order.
5. Проверить crash/error dashboards.
6. Проверить API version compatibility.
7. Усиленно наблюдать минимум 24 часа.
8. Подготовить hotfix path, но не создавать hotfix без дефекта.

## Artifacts

- Submission status timeline.
- Review correspondence summary.
- Post-release smoke report.
- 24-hour monitoring report.

## Автоматический gate

```bash
npm run ios:store-preflight
npm run ios:test
npm run ios:ui
npm run launch:check
```

## Ручной gate

- Установка реальной store build.
- Проверка на физическом iPhone.
- Проверка production API.
- Проверка privacy/support URLs.

## Stop conditions

- Production gate красный.
- Demo account не работает.
- Apple запросил clarification.
- Store build обращается к localhost/staging.
- Critical crash после релиза.

## Acceptance

- Четыре приложения доступны целевой аудитории.
- Clean install smoke зелёный.
- 24 часа без critical incident.

## Rollback

App Store binary нельзя мгновенно откатить. Использовать:

- server-compatible rollback;
- feature flags;
- disabling dangerous provider action;
- expedited hotfix только при подтверждённом дефекте.

---

# Phase 13 — Post-launch product improvements

## Цель

Развивать продукт после стабилизации, не смешивая growth с production blockers.

## Приоритет A

- Кыргызская локализация.
- Product analytics и consent-aware funnel.
- Warranty/service timeline.
- Order repeat.
- Session/device management.
- Better offline conflict UI.

## Приоритет B

- Availability по точкам.
- Delivery ETA.
- Personal offers.
- Compare/favorites refinement.
- Staff SLA dashboards.
- Courier route optimization.
- POS hardware workflow.

## Приоритет C

- AI recommendations с offline eval.
- WhatsApp/Telegram surfaces.
- Franchise/marketing extensions.

## Правила

- Каждая feature имеет API contract, ownership, RBAC и Ledger impact.
- AI не изменяет деньги, склад или статус напрямую.
- Growth-события не обходят consent.
- Новая функция не ухудшает SLO и release gates.

## Acceptance

Для каждой feature отдельно:

- тест;
- analytics event;
- loading/empty/error/permission/offline states;
- accessibility;
- privacy review;
- rollback/feature flag;
- measurable success metric.

---

## 8. Глобальный Definition of Done

Программа считается завершённой, когда одновременно выполнено:

1. `npm run launch:check` — exit 0.
2. `npm run api:test:isolated` — exit 0.
3. `npm run api:build` — exit 0.
4. `npm run ios:build`, `ios:test`, `ios:ui` — exit 0.
5. `npm run ecosystem:e2e` и `ecosystem:verify` — exit 0.
6. Secret/dependency scans не имеют unresolved critical.
7. Public API работает в production без escape hatch.
8. Evidence хранится в private R2 и выдаётся signed URL.
9. SMTP, critical alert и push проверены реальной доставкой.
10. SMS либо certified, либо отключён с утверждённой альтернативой входа.
11. Outbox работает, нет устаревшего backlog.
12. Backup восстановлен из production R2.
13. Один order прошёл Client → Staff → Courier/POS.
14. Money, stock, journal и Event Ledger сошлись.
15. Физические устройства и применимое POS-железо приняты.
16. Юридические/фискальные решения подтверждены владельцем и специалистами.
17. App Store build прошёл clean-install production smoke.
18. Post-launch monitoring не показывает critical incident.

Нельзя заменять невыполненный ручной пункт зелёным unit test.

---

## 9. Финальный отчёт программы

```markdown
# AliStore production acceptance

Date:
Release:
Commit:

## Executive verdict
GO | NO-GO

## Phase status
| Phase | Status | Evidence | Blocker |

## Automated gates
| Command | Exit | Counts | Artifact |

## Live production probes
| Probe | Result | Timestamp |

## Business reconciliation
| Flow | Money | Stock | Ledger | Verdict |

## External certifications
| Provider/device/legal | Evidence | Owner | Verdict |

## Rollback readiness
- API:
- DB:
- R2:
- App Store:

## Residual risks
1.

## Owner decisions required
1.
```

Финальный `GO` допустим только при выполнении глобального Definition of Done либо
при явно подписанном владельцем перечне исключений с ограниченным сроком действия.
