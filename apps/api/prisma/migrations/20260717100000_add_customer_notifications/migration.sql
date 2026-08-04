CREATE TABLE "CustomerNotification" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT 'bell.fill',
    "route" TEXT NOT NULL DEFAULT 'account',
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerNotification_customerId_createdAt_idx"
  ON "CustomerNotification"("customerId", "createdAt");
CREATE INDEX "CustomerNotification_customerId_readAt_idx"
  ON "CustomerNotification"("customerId", "readAt");

ALTER TABLE "CustomerNotification"
  ADD CONSTRAINT "CustomerNotification_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
