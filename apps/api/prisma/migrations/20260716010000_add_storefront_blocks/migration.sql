CREATE TYPE "StorefrontBlockType" AS ENUM ('hero', 'promo', 'info', 'collection');
CREATE TYPE "StorefrontBlockStatus" AS ENUM ('draft', 'published', 'scheduled', 'archived');
CREATE TYPE "StorefrontBlockDevice" AS ENUM ('all', 'desktop', 'mobile');

CREATE TABLE "StorefrontBlock" (
  "id" TEXT NOT NULL,
  "type" "StorefrontBlockType" NOT NULL,
  "status" "StorefrontBlockStatus" NOT NULL DEFAULT 'draft',
  "device" "StorefrontBlockDevice" NOT NULL DEFAULT 'all',
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "eyebrow" TEXT,
  "body" TEXT,
  "ctaLabel" TEXT,
  "ctaHref" TEXT,
  "imageUrl" TEXT,
  "tone" TEXT NOT NULL DEFAULT 'dark',
  "productIds" TEXT[] NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorefrontBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorefrontBlock_status_device_position_idx" ON "StorefrontBlock"("status", "device", "position");
CREATE INDEX "StorefrontBlock_type_startsAt_endsAt_idx" ON "StorefrontBlock"("type", "startsAt", "endsAt");
