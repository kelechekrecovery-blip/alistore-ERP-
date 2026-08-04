-- Review-login state is security-sensitive and may be written by more than one
-- API instance. Refuse to install constraints over unexpected legacy state so
-- deployment cannot silently preserve an invalid global attempt budget.
DO $$
DECLARE
  invalid_rows INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO invalid_rows
  FROM "ReviewLoginGuard"
  WHERE attempts < 0
     OR successes < 0
     OR phone !~ '^\+[1-9][0-9]{8,14}$';

  IF invalid_rows > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce ReviewLoginGuard constraints: % invalid row(s); repair canonical phone and nonnegative counters first',
      invalid_rows
      USING ERRCODE = '23514';
  END IF;
END
$$;

ALTER TABLE "ReviewLoginGuard"
  ADD CONSTRAINT "ReviewLoginGuard_attempts_nonnegative"
    CHECK (attempts >= 0),
  ADD CONSTRAINT "ReviewLoginGuard_successes_nonnegative"
    CHECK (successes >= 0),
  ADD CONSTRAINT "ReviewLoginGuard_phone_canonical"
    CHECK (phone ~ '^\+[1-9][0-9]{8,14}$');
