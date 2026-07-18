-- FIN-003E: preserve an unfinished payment cancellation as an explicit state.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'voided';
