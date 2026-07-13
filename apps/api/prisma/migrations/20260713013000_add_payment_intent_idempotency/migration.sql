CREATE TABLE "OnlinePaymentIntentCommand" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "returnUrl" TEXT,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlinePaymentIntentCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnlinePaymentIntentCommand_idempotencyKey_key"
ON "OnlinePaymentIntentCommand"("idempotencyKey");

CREATE INDEX "OnlinePaymentIntentCommand_customerId_createdAt_idx"
ON "OnlinePaymentIntentCommand"("customerId", "createdAt");

CREATE INDEX "OnlinePaymentIntentCommand_orderId_idx"
ON "OnlinePaymentIntentCommand"("orderId");
