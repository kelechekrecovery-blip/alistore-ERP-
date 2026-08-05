ALTER TABLE "TelegramAgentIdentity" ADD COLUMN "botId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "TelegramAgentPairing" ADD COLUMN "botId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "TelegramAgentMessage" ADD COLUMN "botId" TEXT NOT NULL DEFAULT 'legacy';

DROP INDEX IF EXISTS "TelegramAgentIdentity_telegramUserId_key";
DROP INDEX IF EXISTS "TelegramAgentIdentity_customerId_key";
DROP INDEX IF EXISTS "TelegramAgentIdentity_staffId_key";
DROP INDEX IF EXISTS "TelegramAgentMessage_externalKey_key";
CREATE UNIQUE INDEX "TelegramAgentIdentity_botId_telegramUserId_key" ON "TelegramAgentIdentity"("botId", "telegramUserId");
CREATE UNIQUE INDEX "TelegramAgentIdentity_botId_customerId_key" ON "TelegramAgentIdentity"("botId", "customerId");
CREATE UNIQUE INDEX "TelegramAgentIdentity_botId_staffId_key" ON "TelegramAgentIdentity"("botId", "staffId");
CREATE UNIQUE INDEX "TelegramAgentMessage_botId_externalKey_key" ON "TelegramAgentMessage"("botId", "externalKey");
