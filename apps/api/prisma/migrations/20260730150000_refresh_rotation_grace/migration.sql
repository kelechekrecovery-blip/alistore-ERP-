-- Distinguish a normally rotated token from logout/recovery revocation.
-- Only normal rotations receive the short concurrent-request grace window.
ALTER TABLE "RefreshToken"
ADD COLUMN "rotatedAt" TIMESTAMP(3);
