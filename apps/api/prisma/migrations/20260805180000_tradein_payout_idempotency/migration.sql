ALTER TABLE "TradeInDevice" ADD COLUMN payout BOOLEAN NOT NULL DEFAULT false;

-- Historical staff buybacks are identifiable from their durable accounting
-- source. Backfill them so cross-mode idempotency replays fail closed.
UPDATE "TradeInDevice" AS tradein
SET payout = true
WHERE EXISTS (
  SELECT 1
  FROM "AccountingJournalEntry" AS entry
  WHERE entry."sourceType" = 'tradein.buyback'
    AND entry."sourceRef" = tradein.id
);
