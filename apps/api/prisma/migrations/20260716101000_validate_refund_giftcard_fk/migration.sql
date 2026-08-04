BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_giftCardId_fkey";
ALTER TABLE "GiftCardTransaction" VALIDATE CONSTRAINT "GiftCardTransaction_source_valid";

COMMIT;
