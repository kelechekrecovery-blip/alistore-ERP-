#!/usr/bin/env node
/**
 * `apps/mobile` (Expo) is DEPRECATED: it is a two-screen monolith that bundles the
 * customer app and the staff POS into one binary under `kg.alistore.mobile`, and the
 * four native iOS + four native Android targets have long overtaken it (offline
 * queues, idempotency, trade-in, real APNs/FCM — none of which exist in Expo).
 *
 * The package still ships a live store pipeline (`eas.json` with a production submit
 * profile, OTA `updates.enabled: true`), so a single `eas:submit` would push that
 * stale monolith to the stores. These root scripts used to run it; they now refuse
 * and explain why, instead of silently keeping a retired artifact operational.
 *
 * Removing the package itself is a separate slice (GAP-EXPO-RETIRE-001): two pieces
 * are worth extracting to docs first — LOGIC-012 in `src/checkout-idempotency.ts`
 * and the push-registration contract in `src/push-notifications.ts`.
 */
const requested = process.argv[2] ?? 'this command';

console.error(`
  apps/mobile (Expo) выведен из эксплуатации — «${requested}» не выполняется.

  Почему: это DEPRECATED-монолит «клиент + POS» в одном бинарнике под bundle
  kg.alistore.mobile. Нативные таргеты (apps/ios, apps/android) его обогнали.
  Держать его в релизных скриптах опасно: один запуск eas:submit отправит в
  сторы устаревшее приложение.

  Что делать вместо этого:
    • сборка/тесты iOS      → npm run ios:build | npm run ios:test
    • сборка/тесты Android  → npm run android:build | npm run android:test
    • релизный гейт         → npm run mvp:verify

  Если пакет нужен для археологии — запускай его напрямую из apps/mobile,
  осознавая, что это не релизный артефакт.
`);

process.exit(1);
