#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/apps/api/prisma/migrations"
TARGET="20260715150000_add_service_parts_and_execution"
DB="alistore_service_migration_${RANDOM}_$$"

cleanup() {
  dropdb -U alistore --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

createdb -U alistore "$DB"
for file in "$MIGRATIONS"/*/migration.sql; do
  migration="$(basename "$(dirname "$file")")"
  if [[ "$migration" == "$TARGET" ]]; then
    break
  fi
  psql -U alistore -d "$DB" -v ON_ERROR_STOP=1 -f "$file" >/dev/null
done

psql -U alistore -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO "StaffUser" ("id", "username", "passwordHash", "role")
VALUES ('staff-legacy', 'staff-legacy', 'hash', 'owner');
INSERT INTO "CashShift" ("id", "staffId", "point", "openCash", "openedAt")
VALUES ('shift-legacy', 'staff-legacy', 'OSH-1', 0, NOW() - INTERVAL '1 hour');
INSERT INTO "Customer" ("id", "phone", "name")
VALUES ('customer-legacy', '+996700000099', 'Legacy Customer');
INSERT INTO "WarrantyCase" ("id", "imei", "customerId", "problem", "status", "serviceType", "deviceName", "sla")
VALUES ('case-legacy', 'LEGACY-SERVICE-SN', 'customer-legacy', 'Legacy repair', 'repaired', 'paid', 'Legacy Phone', NOW() + INTERVAL '1 day');
INSERT INTO "ServiceWorkOrder" ("id", "warrantyCaseId", "createdBy", "point", "updatedAt")
VALUES ('work-order-legacy', 'case-legacy', 'staff-legacy', 'OSH-1', NOW());
INSERT INTO "Payment" ("id", "serviceWorkOrderId", "originalPaymentId", "amount", "method", "status")
VALUES
  ('payment-legacy', 'work-order-legacy', NULL, 5000, 'cash', 'received'),
  ('refund-legacy', 'work-order-legacy', 'payment-legacy', -1000, 'cash', 'refunded');
INSERT INTO "AuditEvent" ("id", "type", "actor", "payload", "refs")
VALUES (
  'event-legacy-refund',
  'payment.refunded',
  'owner-legacy',
  '{"refundId":"refund-legacy","originalPaymentId":"payment-legacy","amount":1000}'::jsonb,
  ARRAY['work-order-legacy', 'payment-legacy', 'refund-legacy']
);
SQL

psql -U alistore -d "$DB" -v ON_ERROR_STOP=1 -f "$MIGRATIONS/$TARGET/migration.sql" >/dev/null
actual="$(psql -U alistore -d "$DB" -At <<'SQL'
SELECT concat_ws('|', refund."originalPaymentId", work_order."point", work_order."repairStartedAt" IS NOT NULL, work_order."repairCompletedAt" IS NOT NULL)
FROM "Payment" refund
JOIN "ServiceWorkOrder" work_order ON work_order."id" = refund."serviceWorkOrderId"
WHERE refund."id" = 'refund-legacy';
SQL
)"

if [[ "$actual" != "payment-legacy|OSH-1|t|t" ]]; then
  echo "service payment migration regression: expected payment-legacy|OSH-1|t|t, got $actual" >&2
  exit 1
fi

echo "service payment migration regression passed"
