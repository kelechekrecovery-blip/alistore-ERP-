-- Global, durable budget for the short-lived review credential. It is keyed by
-- canonical phone, not IP, so distributed guesses share one lockout state.
CREATE TABLE "ReviewLoginGuard" (
  "phone" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "successes" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReviewLoginGuard_pkey" PRIMARY KEY ("phone")
);

CREATE INDEX "ReviewLoginGuard_lockedUntil_idx"
ON "ReviewLoginGuard"("lockedUntil");
