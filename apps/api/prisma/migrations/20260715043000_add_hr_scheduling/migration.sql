CREATE TYPE "HrAbsenceType" AS ENUM ('annual_leave', 'sick_leave', 'unpaid_leave', 'other');
CREATE TYPE "HrAbsenceStatus" AS ENUM ('requested', 'approved', 'rejected', 'cancelled');

CREATE TABLE "HrSchedule" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "point" TEXT NOT NULL,
  "shiftDate" DATE NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrAttendance" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "point" TEXT NOT NULL,
  "checkedInAt" TIMESTAMP(3) NOT NULL,
  "checkedOutAt" TIMESTAMP(3),
  "checkInKey" TEXT NOT NULL,
  "checkOutKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrAttendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrAbsence" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "type" "HrAbsenceType" NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "reason" TEXT,
  "status" "HrAbsenceStatus" NOT NULL DEFAULT 'requested',
  "createdBy" TEXT NOT NULL,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrAbsence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrSchedule_idempotencyKey_key" ON "HrSchedule"("idempotencyKey");
CREATE UNIQUE INDEX "HrSchedule_staffId_shiftDate_key" ON "HrSchedule"("staffId", "shiftDate");
CREATE INDEX "HrSchedule_point_shiftDate_idx" ON "HrSchedule"("point", "shiftDate");
CREATE UNIQUE INDEX "HrAttendance_scheduleId_key" ON "HrAttendance"("scheduleId");
CREATE UNIQUE INDEX "HrAttendance_checkInKey_key" ON "HrAttendance"("checkInKey");
CREATE UNIQUE INDEX "HrAttendance_checkOutKey_key" ON "HrAttendance"("checkOutKey");
CREATE INDEX "HrAttendance_staffId_checkedInAt_idx" ON "HrAttendance"("staffId", "checkedInAt");
CREATE INDEX "HrAttendance_point_checkedInAt_idx" ON "HrAttendance"("point", "checkedInAt");
CREATE UNIQUE INDEX "HrAbsence_idempotencyKey_key" ON "HrAbsence"("idempotencyKey");
CREATE INDEX "HrAbsence_staffId_startsOn_endsOn_idx" ON "HrAbsence"("staffId", "startsOn", "endsOn");
CREATE INDEX "HrAbsence_status_startsOn_idx" ON "HrAbsence"("status", "startsOn");

ALTER TABLE "HrSchedule" ADD CONSTRAINT "HrSchedule_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrAttendance" ADD CONSTRAINT "HrAttendance_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "HrSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrAttendance" ADD CONSTRAINT "HrAttendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrAbsence" ADD CONSTRAINT "HrAbsence_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
