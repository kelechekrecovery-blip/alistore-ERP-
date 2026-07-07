-- AlterTable
ALTER TABLE "TradeInDevice" ADD COLUMN     "imei" TEXT;

-- CreateIndex
CREATE INDEX "TradeInDevice_imei_idx" ON "TradeInDevice"("imei");
