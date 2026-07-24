-- Bind StaffUser.point to a real StorePoint.
--
-- `point` was a free string (default 'BISHKEK-1'), so a typo silently detached a
-- staff account from every point-scoped report. The value has always equalled a
-- StorePoint.inventoryLocation (the seeded default point is 'BISHKEK-1'), so the
-- FK targets that unique column.
--
-- Backfill first, invariant second: any point without a matching StorePoint
-- becomes an inactive placeholder so the constraint can be added without dropping
-- a single staff row. Ids/keys are derived deterministically from the point value,
-- and the whole statement is idempotent via NOT EXISTS.

INSERT INTO "StorePoint" (
  "id", "code", "name", "address", "inventoryLocation", "hours",
  "pickupInstructions", "active", "sortOrder", "createdBy", "idempotencyKey", "updatedAt"
)
SELECT DISTINCT
  'staff-point-' || s."point",
  'staff-point-' || s."point",
  'Точка ' || s."point" || ' (восстановлена миграцией staff_point_fk)',
  '—',
  s."point",
  '—',
  NULL,
  false,
  1000,
  'migration:staff_point_fk',
  'staff-point-fk:' || s."point",
  CURRENT_TIMESTAMP
FROM "StaffUser" s
WHERE NOT EXISTS (
  SELECT 1 FROM "StorePoint" p WHERE p."inventoryLocation" = s."point"
);

CREATE INDEX "StaffUser_point_idx" ON "StaffUser"("point");

ALTER TABLE "StaffUser"
  ADD CONSTRAINT "StaffUser_point_fkey"
  FOREIGN KEY ("point") REFERENCES "StorePoint"("inventoryLocation")
  ON DELETE RESTRICT ON UPDATE CASCADE;
