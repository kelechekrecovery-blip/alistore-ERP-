-- Run only after every new-version relay worker has stopped and before any
-- legacy worker starts. Attempts at the cap are parked because delivery may
-- already have reached the provider; lower attempts become immediately due.
UPDATE "OutboxMessage"
SET
  status = CASE
    WHEN attempts >= 5 THEN 'failed'::"OutboxStatus"
    ELSE 'pending'::"OutboxStatus"
  END,
  "processingToken" = NULL,
  "nextAttemptAt" = CASE
    WHEN attempts >= 5 THEN NULL
    ELSE TIMESTAMP '1970-01-01 00:00:00'
  END,
  "lastError" = CASE
    WHEN attempts >= 5 THEN 'rollback_parked_ambiguous_final_claim'
    ELSE COALESCE("lastError", 'rollback_reset_processing_claim')
  END
WHERE status = 'processing';
