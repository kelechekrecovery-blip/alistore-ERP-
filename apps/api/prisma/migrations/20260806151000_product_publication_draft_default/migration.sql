-- Release B switch: Release A already filters public reads by this column, so
-- legacy writers that omit it now fail closed as drafts during a rolling deploy.
SET lock_timeout = '5s';

ALTER TABLE "Product"
ALTER COLUMN "published" SET DEFAULT false;

RESET lock_timeout;
