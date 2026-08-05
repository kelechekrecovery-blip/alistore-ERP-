-- Prevent concurrent relay workers from delivering the same outbox row.
-- nextAttemptAt is the processing lease deadline while status=processing.
ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'processing';
