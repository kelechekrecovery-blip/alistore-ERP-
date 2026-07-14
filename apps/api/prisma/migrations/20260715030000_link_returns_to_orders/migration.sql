DELETE FROM "ReturnItem"
WHERE "returnId" IN (
  SELECT r."id" FROM "Return" r LEFT JOIN "Order" o ON o."id" = r."orderId" WHERE o."id" IS NULL
);
DELETE FROM "Return" r
WHERE NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."id" = r."orderId");

ALTER TABLE "Return" ADD CONSTRAINT "Return_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
