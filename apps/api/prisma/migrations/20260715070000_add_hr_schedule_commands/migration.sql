ALTER TABLE "HrSchedule"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" TEXT,
  ADD COLUMN "cancelReason" TEXT;

CREATE TABLE "HrScheduleCommand" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrScheduleCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrScheduleCommand_idempotencyKey_key" ON "HrScheduleCommand"("idempotencyKey");
CREATE INDEX "HrScheduleCommand_scheduleId_createdAt_idx" ON "HrScheduleCommand"("scheduleId", "createdAt");
