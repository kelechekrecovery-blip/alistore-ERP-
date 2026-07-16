CREATE TABLE "EvidenceUpload" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT,
    "fingerprint" TEXT NOT NULL,
    "asset" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvidenceUpload_idempotencyKey_key" ON "EvidenceUpload"("idempotencyKey");
CREATE INDEX "EvidenceUpload_entityType_entityId_idx" ON "EvidenceUpload"("entityType", "entityId");
