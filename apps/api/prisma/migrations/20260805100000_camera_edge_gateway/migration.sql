CREATE TABLE "EdgeDevice" (
  "id" TEXT NOT NULL,
  "storePointId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'camera',
  "name" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastSeenAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EdgeDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CameraDetection" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "edgeDeviceId" TEXT NOT NULL,
  "storePointId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "value" JSONB NOT NULL,
  "privacyLevel" TEXT NOT NULL DEFAULT 'non_identifying',
  "evidenceRef" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "retentionUntil" TIMESTAMP(3),
  "purgedAt" TIMESTAMP(3),
  "purgeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CameraDetection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CameraDetection_idempotencyKey_key" ON "CameraDetection"("idempotencyKey");
CREATE INDEX "EdgeDevice_storePointId_status_idx" ON "EdgeDevice"("storePointId", "status");
CREATE INDEX "EdgeDevice_lastSeenAt_idx" ON "EdgeDevice"("lastSeenAt");
CREATE INDEX "CameraDetection_storePointId_occurredAt_idx" ON "CameraDetection"("storePointId", "occurredAt");
CREATE INDEX "CameraDetection_eventType_occurredAt_idx" ON "CameraDetection"("eventType", "occurredAt");
CREATE INDEX "CameraDetection_retentionUntil_idx" ON "CameraDetection"("retentionUntil");
ALTER TABLE "EdgeDevice" ADD CONSTRAINT "EdgeDevice_storePointId_fkey" FOREIGN KEY ("storePointId") REFERENCES "StorePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CameraDetection" ADD CONSTRAINT "CameraDetection_edgeDeviceId_fkey" FOREIGN KEY ("edgeDeviceId") REFERENCES "EdgeDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CameraDetection" ADD CONSTRAINT "CameraDetection_storePointId_fkey" FOREIGN KEY ("storePointId") REFERENCES "StorePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
