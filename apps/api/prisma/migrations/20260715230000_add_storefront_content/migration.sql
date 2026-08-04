CREATE TABLE "StorefrontContentRevision" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "heroEyebrow" TEXT NOT NULL,
    "heroTitle" TEXT NOT NULL,
    "heroBody" TEXT NOT NULL,
    "heroCtaLabel" TEXT NOT NULL,
    "heroCtaHref" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "financingText" TEXT,
    "aboutTitle" TEXT NOT NULL,
    "aboutBody" TEXT NOT NULL,
    "deliveryTitle" TEXT NOT NULL,
    "deliveryBody" TEXT NOT NULL,
    "contactPhone" TEXT,
    "supportHours" TEXT,
    "benefits" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "StorefrontContentRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorefrontContentRevision_version_key" ON "StorefrontContentRevision"("version");
CREATE INDEX "StorefrontContentRevision_status_publishedAt_idx" ON "StorefrontContentRevision"("status", "publishedAt");
