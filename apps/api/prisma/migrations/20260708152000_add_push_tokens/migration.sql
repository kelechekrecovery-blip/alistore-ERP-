-- Mobile push token registry for native App Store / Google Play builds.
-- Tokens can start anonymous and later become bound to an authenticated
-- customer or staff account.
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "appScope" TEXT NOT NULL DEFAULT 'anonymous',
    "customerId" TEXT,
    "staffId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");
CREATE INDEX "PushToken_customerId_enabled_idx" ON "PushToken"("customerId", "enabled");
CREATE INDEX "PushToken_staffId_enabled_idx" ON "PushToken"("staffId", "enabled");
CREATE INDEX "PushToken_platform_idx" ON "PushToken"("platform");

ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_staffId_fkey"
FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
