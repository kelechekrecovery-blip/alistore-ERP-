-- Cross-row balance is checked at transaction commit so nested line creation can
-- insert both sides before validation. This protects direct SQL/Prisma writers too.
CREATE OR REPLACE FUNCTION "enforce_accounting_entry_balanced"()
RETURNS TRIGGER AS $$
DECLARE
  candidate_id TEXT;
  candidate_ids TEXT[];
  debit_total BIGINT;
  credit_total BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    candidate_ids := ARRAY[NEW."entryId"];
  ELSIF TG_OP = 'DELETE' THEN
    candidate_ids := ARRAY[OLD."entryId"];
  ELSE
    candidate_ids := ARRAY[OLD."entryId", NEW."entryId"];
  END IF;
  FOR candidate_id IN
    SELECT DISTINCT value FROM unnest(candidate_ids) value
    WHERE value IS NOT NULL
  LOOP
    IF EXISTS (SELECT 1 FROM "AccountingJournalEntry" WHERE "id" = candidate_id) THEN
      SELECT COALESCE(SUM("debit"), 0), COALESCE(SUM("credit"), 0)
        INTO debit_total, credit_total
        FROM "AccountingJournalLine" WHERE "entryId" = candidate_id;
      IF debit_total <= 0 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'accounting entry % is unbalanced: debit %, credit %', candidate_id, debit_total, credit_total
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "AccountingJournalLine_balanced_entry_check"
AFTER INSERT OR UPDATE OR DELETE ON "AccountingJournalLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_accounting_entry_balanced"();
