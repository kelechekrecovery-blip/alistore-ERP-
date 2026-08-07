# Production Launch Blockers — Live check 2026-08-07

## Что подтверждено в продакшне (live)

- API liveness: `https://api.ali.kg/api/health/live` → `{"status":"ok"}`
- API readiness: `https://api.ali.kg/api/health/ready` → `{"status":"ok"}`
- `/api/auth/methods` returns:
  - `phone.enabled=false`, `phone.registers=false`
  - `email.enabled=true`, `email.registers=false`
  - `apple.enabled=true`, `apple.clientId=kg.alistore.web`, `apple.registers=false`
  - `google.enabled=true`, `google.registers=false`
  - `recovery.enabled=false`
  - `registrationAvailable=false`
- `deployment-smoke` with `REQUIRE_CUSTOMER_AUTH_CONFIGURATION=true` fails с:
  - phone login/registration
  - account recovery
  - Apple login/registration
  - Apple redirect URI
  - Google login/registration
  - registrationAvailable
- `https://api.ali.kg/api/health/worker` → `404`
- `https://api.ali.kg/api/auth/apple/status` → `404`

## Что показывает worker dry-run (без внесения изменений)

`node scripts/activate-production-worker.mjs --env-file /Users/alistore/.codex/deployments/alistore-production-auth/apps/api/.env.production.local --dry-run`

Результат: `Production preflight: blocked`, blocked=15 (node_env ready; остальные отсутствуют):

1. `DATABASE_URL`
2. `CORS_ORIGINS`
3. `ALLOWED_HOSTS`
4. `JWT_SECRET`
5. `AUTH_OTP_DEV_ECHO`
6. `SMTP_HOST`
7. `SMTP_FROM`
8. `RESERVATION_SWEEP_ENABLED`
9. `DEBT_REMINDERS_ENABLED`
10. `ALERT_TELEGRAM_BOT_TOKEN`
11. `ALERT_TELEGRAM_CHAT_ID`
12. `OUTBOX_RELAY_ENABLED`
13. `NOTIFICATION_TRANSPORT`
14. `PUBLIC_DEMO_MODE`
15. `PAYMENT_PROVIDER`
16. `PAYMENT_PROVIDER_CERTIFIED`
17. `MEDIA_STORAGE`
18. `S3_ENDPOINT`
19. `MINIO_BUCKET`
20. `MINIO_ROOT_USER`
21. `MINIO_ROOT_PASSWORD`
22. `JOB_BACKEND`
23. `REDIS_URL`
24. `SMS_PROVIDER`

## Немедленный порядок действий для выхода в режим ready

1. Настроить production runtime env (внешний контроллер: Render/секреты):
   - `NODE_ENV`, `DATABASE_URL`, `CORS_ORIGINS`, `ALLOWED_HOSTS`, `JWT_SECRET`,
     `AUTH_OTP_DEV_ECHO=false`, `SMTP_HOST`, `SMTP_FROM`, `RESERVATION_SWEEP_ENABLED=true`,
     `DEBT_REMINDERS_ENABLED=true`, `OUTBOX_RELAY_ENABLED=true`,
     `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID`,
     `NOTIFICATION_TRANSPORT`, `PUBLIC_DEMO_MODE`, `PAYMENT_PROVIDER`,
     `PAYMENT_PROVIDER_CERTIFIED`, `MEDIA_STORAGE`, `S3_ENDPOINT`, `MINIO_BUCKET`,
     `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `JOB_BACKEND=bullmq`,
     `REDIS_URL`, `SMS_PROVIDER`, и все связанные секреты.
2. Включить production flags для регистрации:
   - `AUTH_SOCIAL_FIRST_SIGNUP_ENABLED=true`
   - `AUTH_REVIEWS_ENABLE=true` при необходимости
3. Проверить Apple:
   - `apple id token` в проде должен проходить только с валидным `APPLE_CLIENT_ID`/`APPLE_WEB_CLIENT_ID`
   - `/api/auth/apple/status` должен стать доступен и return success
4. Включить/прогнать worker и web smoke:
   - `scripts/deployment-smoke.mjs` с `REQUIRE_CUSTOMER_AUTH_CONFIGURATION=true`
   - `api health`, `web login` и `auth methods`
5. Только после успешных smoke выполнить Apple review physical-тест и ответ в ASC.

