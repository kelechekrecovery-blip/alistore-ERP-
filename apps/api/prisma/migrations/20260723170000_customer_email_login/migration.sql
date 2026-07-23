-- Вход по email как второй канал к тому же аккаунту.
-- Телефон остаётся первичным идентификатором Customer (доставка и COD без него
-- не работают), поэтому email добавляется отдельной необязательной колонкой.

-- Адрес хранится нормализованным в нижнем регистре, поэтому одного UNIQUE хватает,
-- чтобы Ivan@Example.com и ivan@example.com не стали двумя аккаунтами.
ALTER TABLE "Customer" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- Привязка адреса — отдельная цель кода, чтобы код на привязку нельзя было
-- предъявить как код на вход.
ALTER TYPE "OtpPurpose" ADD VALUE 'email_attach';

CREATE TYPE "OtpChannel" AS ENUM ('sms', 'email');

-- Исторические вызовы все были SMS: DEFAULT 'sms' проставляет им канал, а их
-- phone остаётся на месте — NOT NULL снимается только для будущих email-строк.
ALTER TABLE "OtpChallenge" ADD COLUMN "channel" "OtpChannel" NOT NULL DEFAULT 'sms';
ALTER TABLE "OtpChallenge" ADD COLUMN "email" TEXT;
ALTER TABLE "OtpChallenge" ALTER COLUMN "phone" DROP NOT NULL;
CREATE INDEX "OtpChallenge_email_idx" ON "OtpChallenge"("email");
