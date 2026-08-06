-- Backward-compatible expand: the constant default is metadata-only on
-- PostgreSQL 11+, so existing published catalog rows are not rewritten.
SET lock_timeout = '5s';

ALTER TABLE "Product"
ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;

RESET lock_timeout;
