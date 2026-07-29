-- Operational location identity must always be selected through an active
-- StorePoint; a database default could silently attach new staff to a legacy
-- warehouse when an internal provisioning path omitted the field.
ALTER TABLE "StaffUser" ALTER COLUMN "point" DROP DEFAULT;
