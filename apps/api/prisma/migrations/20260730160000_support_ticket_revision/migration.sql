ALTER TABLE "SupportTicket"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "SupportTicket_revision_nonnegative"
    CHECK ("revision" >= 0);

-- One database-owned monotonic version covers every writer, including future
-- services and maintenance SQL that could otherwise forget an application-side
-- increment and reintroduce an ABA approval replay.
CREATE OR REPLACE FUNCTION "increment_support_ticket_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."revision" := OLD."revision" + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SupportTicket_revision_increment"
BEFORE UPDATE ON "SupportTicket"
FOR EACH ROW
EXECUTE FUNCTION "increment_support_ticket_revision"();
