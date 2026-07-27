#!/usr/bin/env node
/**
 * Готовит учётные данные для ревью App Store и печатает их в терминал.
 *
 * Секреты НЕ коммитятся: скрипт генерирует их при запуске, значения живут только
 * в выводе. Владелец копирует env-блок на сервер, выполняет curl-команды и
 * вставляет те же логины/пароли в поля Demo Account в App Store Connect.
 *
 * Пароли сотрудников соответствуют политике F-19 (≥12, ≥3 класса символов).
 * Учётки создаются штатным `POST /staff-auth/staff` — то есть с argon2-хэшем,
 * корректным id и `totpEnabled=false` по умолчанию (ревьюера не запрёт 2FA).
 *
 * Запуск:  node scripts/prepare-review-credentials.mjs
 *          API_BASE=https://api.ali.kg/api node scripts/prepare-review-credentials.mjs
 */
import crypto from 'node:crypto';

const API_BASE = process.env.API_BASE ?? 'https://api.ali.kg/api';

const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SPECIAL = '!@#$%-_+=';
const ALL = LOWER + UPPER + DIGIT + SPECIAL;

function pick(alphabet) {
  return alphabet[crypto.randomInt(alphabet.length)];
}

/** Сильный пароль: гарантированно все четыре класса, длина 16. */
function strongPassword() {
  const base = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SPECIAL)];
  while (base.length < 16) base.push(pick(ALL));
  // Перемешать, чтобы обязательные классы не стояли всегда в начале.
  for (let i = base.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
}

const suffix = crypto.randomBytes(3).toString('hex');
const reviewPhone = `+9967009${String(crypto.randomInt(100000, 999999))}`.slice(0, 13);
const reviewOtp = String(crypto.randomInt(100000, 999999));
const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const staff = [
  { app: 'Staff', username: `review_staff_${suffix}`, role: 'seller', password: strongPassword() },
  { app: 'Courier', username: `review_courier_${suffix}`, role: 'courier', password: strongPassword() },
  { app: 'POS', username: `review_cashier_${suffix}`, role: 'cashier', password: strongPassword() },
];

const line = '─'.repeat(72);
console.log(`\n${line}\nУЧЁТНЫЕ ДАННЫЕ ДЛЯ РЕВЬЮ APP STORE — не коммитить, удалить после ревью\n${line}`);

console.log(`\n1) CLIENT (AliStore KG) — вход по фиксированному коду через env API-сервера.`);
console.log(`   Выставьте на сервере (и уберите после ревью):`);
console.log(`     AUTH_REVIEW_PHONE=${reviewPhone}`);
console.log(`     AUTH_REVIEW_OTP=${reviewOtp}`);
console.log(`     AUTH_REVIEW_UNTIL=${until}      # авто-закрытие окна, даже если забыть убрать env`);
console.log(`   В App Store Connect → App Review Information → Sign-In required:`);
console.log(`     User name: ${reviewPhone}`);
console.log(`     Password:  ${reviewOtp}`);
console.log(`   Ревьюер вводит номер, затем этот код (SMS не приходит — код фиксированный).`);

console.log(`\n2) STAFF / COURIER / POS — реальные учётки сотрудников. Создайте штатным API`);
console.log(`   (нужен owner-токен: войдите владельцем и подставьте его вместо <OWNER_TOKEN>).`);
console.log(`   TOTP у них выключен по умолчанию — ревьюера не запрёт 2FA.`);
for (const s of staff) {
  console.log(`\n   ── ${s.app} ─ роль ${s.role}`);
  console.log(`   curl -sS -X POST ${API_BASE}/staff-auth/staff \\`);
  console.log(`     -H 'Authorization: Bearer <OWNER_TOKEN>' -H 'Content-Type: application/json' \\`);
  console.log(`     -d '${JSON.stringify({ username: s.username, password: s.password, role: s.role })}'`);
  console.log(`   В ASC Demo Account этого приложения:`);
  console.log(`     User name: ${s.username}`);
  console.log(`     Password:  ${s.password}`);
}

console.log(`\n${line}`);
console.log(`После ревью: убрать AUTH_REVIEW_* с сервера и деактивировать три учётки`);
console.log(`(POST /staff-auth/staff/:id/deactivate). App Privacy — см. docs/APP-STORE-REVIEW-HANDOFF.md`);
console.log(`${line}\n`);
