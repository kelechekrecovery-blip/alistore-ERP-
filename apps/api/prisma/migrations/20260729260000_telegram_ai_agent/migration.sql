CREATE TABLE "TelegramAgentIdentity" (
  "id" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "customerId" TEXT,
  "staffId" TEXT,
  "displayName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAgentIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramAgentIdentity_subject_check" CHECK (
    ("kind" = 'customer' AND "customerId" IS NOT NULL AND "staffId" IS NULL)
    OR
    ("kind" = 'staff' AND "staffId" IS NOT NULL AND "customerId" IS NULL)
  )
);

CREATE TABLE "TelegramAgentPairing" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAgentPairing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramAgentPairing_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "TelegramAgentMessage" (
  "id" TEXT NOT NULL,
  "externalKey" TEXT NOT NULL,
  "identityId" TEXT,
  "telegramUserId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "intent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'received',
  "responseText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAgentMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramAgentMessage_direction_check" CHECK ("direction" IN ('inbound', 'outbound')),
  CONSTRAINT "TelegramAgentMessage_status_check" CHECK ("status" IN ('received', 'answered', 'failed'))
);

CREATE UNIQUE INDEX "TelegramAgentIdentity_telegramUserId_key" ON "TelegramAgentIdentity"("telegramUserId");
CREATE UNIQUE INDEX "TelegramAgentIdentity_customerId_key" ON "TelegramAgentIdentity"("customerId");
CREATE UNIQUE INDEX "TelegramAgentIdentity_staffId_key" ON "TelegramAgentIdentity"("staffId");
CREATE INDEX "TelegramAgentIdentity_customerId_active_idx" ON "TelegramAgentIdentity"("customerId", "active");
CREATE INDEX "TelegramAgentIdentity_staffId_active_idx" ON "TelegramAgentIdentity"("staffId", "active");
CREATE INDEX "TelegramAgentIdentity_chatId_active_idx" ON "TelegramAgentIdentity"("chatId", "active");

CREATE UNIQUE INDEX "TelegramAgentPairing_codeHash_key" ON "TelegramAgentPairing"("codeHash");
CREATE INDEX "TelegramAgentPairing_staffId_expiresAt_idx" ON "TelegramAgentPairing"("staffId", "expiresAt");
CREATE INDEX "TelegramAgentPairing_expiresAt_usedAt_idx" ON "TelegramAgentPairing"("expiresAt", "usedAt");

CREATE UNIQUE INDEX "TelegramAgentMessage_externalKey_key" ON "TelegramAgentMessage"("externalKey");
CREATE INDEX "TelegramAgentMessage_identityId_createdAt_idx" ON "TelegramAgentMessage"("identityId", "createdAt");
CREATE INDEX "TelegramAgentMessage_telegramUserId_createdAt_idx" ON "TelegramAgentMessage"("telegramUserId", "createdAt");
CREATE INDEX "TelegramAgentMessage_status_createdAt_idx" ON "TelegramAgentMessage"("status", "createdAt");

ALTER TABLE "TelegramAgentIdentity"
  ADD CONSTRAINT "TelegramAgentIdentity_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAgentIdentity"
  ADD CONSTRAINT "TelegramAgentIdentity_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAgentPairing"
  ADD CONSTRAINT "TelegramAgentPairing_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAgentMessage"
  ADD CONSTRAINT "TelegramAgentMessage_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "TelegramAgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
