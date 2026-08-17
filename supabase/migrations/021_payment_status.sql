-- Migration: 021_payment_status.sql
-- Description: Extend payment_status lifecycle, add idempotency key, and add
-- duplicate-payment protection indexes.

-- The payment lifecycle is modelled as:
--   PENDING -> PROCESSING -> SUCCESSFUL | FAILED -> REFUNDED
--   and CANCELLED for aborted orders.
-- 'captured' is retained for backwards compatibility with existing rows; new
-- code always writes the six lifecycle states above.
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'successful';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Client-supplied idempotency key so a retried "create payment" request never
-- creates a second provider order for the same intent.
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- Duplicate-payment protection: the provider order id may only map to a single
-- payment row, and a payment link may only be collected once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_provider_order
ON public.payments(provider_order_id)
WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_idempotency
ON public.payments(organization_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_provider_payment
ON public.payments(provider_payment_id)
WHERE provider_payment_id IS NOT NULL;
