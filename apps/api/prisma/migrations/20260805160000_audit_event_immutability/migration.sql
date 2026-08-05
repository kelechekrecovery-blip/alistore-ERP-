-- Event Ledger corrections are compensating INSERTs. Existing facts must never
-- be rewritten or erased, including through statement-level TRUNCATE.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION alistore_reject_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_immutable_guard"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "AuditEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION alistore_reject_audit_event_mutation();

COMMENT ON TRIGGER "AuditEvent_immutable_guard" ON "AuditEvent" IS
  'Reject UPDATE, DELETE and TRUNCATE; corrections must append a compensating event.';

COMMIT;
