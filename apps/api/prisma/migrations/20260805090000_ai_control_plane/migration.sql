CREATE TABLE "AiRun" (
  "id" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "model" TEXT,
  "status" TEXT NOT NULL DEFAULT 'started',
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRunStep" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "toolName" TEXT,
  "inputHash" TEXT,
  "outputSummary" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRunStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiDecision" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "sourceRefs" TEXT[] NOT NULL,
  "recommendation" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRun_actorId_createdAt_idx" ON "AiRun"("actorId", "createdAt");
CREATE INDEX "AiRun_surface_createdAt_idx" ON "AiRun"("surface", "createdAt");
CREATE INDEX "AiRun_status_createdAt_idx" ON "AiRun"("status", "createdAt");
CREATE INDEX "AiRunStep_runId_createdAt_idx" ON "AiRunStep"("runId", "createdAt");
CREATE INDEX "AiDecision_status_createdAt_idx" ON "AiDecision"("status", "createdAt");
CREATE INDEX "AiDecision_runId_idx" ON "AiDecision"("runId");
ALTER TABLE "AiRunStep" ADD CONSTRAINT "AiRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiDecision" ADD CONSTRAINT "AiDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
