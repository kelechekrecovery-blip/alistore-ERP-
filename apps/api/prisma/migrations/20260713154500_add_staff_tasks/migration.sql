CREATE TYPE "StaffTaskStatus" AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "StaffTaskPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TABLE "StaffTask" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "StaffTaskStatus" NOT NULL DEFAULT 'open',
  "priority" "StaffTaskPriority" NOT NULL DEFAULT 'normal',
  "assigneeId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "relatedType" TEXT,
  "relatedId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "StaffTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffTask_assigneeId_status_idx" ON "StaffTask"("assigneeId", "status");
CREATE INDEX "StaffTask_dueAt_idx" ON "StaffTask"("dueAt");
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
