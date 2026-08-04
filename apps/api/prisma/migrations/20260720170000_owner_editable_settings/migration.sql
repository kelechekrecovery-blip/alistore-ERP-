-- Owner-editable business parameters.
--
-- Commercial rules (discount ceilings, payroll base and commission, warranty
-- term, buyback spread, loyalty rate, risk thresholds) were `as const` literals
-- in TypeScript, so changing an employee's pay or a discount limit required a
-- code change and a deploy. Values are text and parsed by the reader, so one
-- table serves numbers, flags and strings without a migration per parameter.
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "Setting_updatedAt_idx" ON "Setting"("updatedAt");
