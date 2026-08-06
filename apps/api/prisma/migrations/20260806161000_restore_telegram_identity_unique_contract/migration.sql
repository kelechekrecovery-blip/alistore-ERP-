-- A partial multi-bot migration replaced the single-column unique indexes,
-- while the deployed Prisma schema and service remained single-bot and use
-- `upsert({ where: { customerId | staffId | telegramUserId } })`. PostgreSQL
-- therefore rejected those upserts with 42P10. Restore the constraints the
-- current application contract declares. The explicit transaction makes the
-- repair all-or-nothing. CREATE UNIQUE INDEX intentionally fails closed if
-- unexpected cross-bot duplicates or same-name definition drift exist; no rows
-- are deleted and the experimental composite indexes remain as extra guards.
BEGIN;

CREATE UNIQUE INDEX "TelegramAgentIdentity_telegramUserId_key"
  ON "TelegramAgentIdentity"("telegramUserId");
CREATE UNIQUE INDEX "TelegramAgentIdentity_customerId_key"
  ON "TelegramAgentIdentity"("customerId");
CREATE UNIQUE INDEX "TelegramAgentIdentity_staffId_key"
  ON "TelegramAgentIdentity"("staffId");
CREATE UNIQUE INDEX "TelegramAgentMessage_externalKey_key"
  ON "TelegramAgentMessage"("externalKey");

COMMIT;
