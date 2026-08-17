-- Migration: 025_payment_promises_v2.sql
-- Description: Rename promise_status enum values to match Phase 16 spec, add source column

-- Create new enum type with the correct values
CREATE TYPE promise_status_v2 AS ENUM ('pending', 'fulfilled', 'missed', 'cancelled');

-- Add the new column using the new enum type
ALTER TABLE public.payment_promises
ADD COLUMN status_v2 promise_status_v2 DEFAULT 'pending';

-- Migrate existing data: active → pending, kept → fulfilled, broken → missed
UPDATE public.payment_promises SET status_v2 = 'pending' WHERE status = 'active';
UPDATE public.payment_promises SET status_v2 = 'fulfilled' WHERE status = 'kept';
UPDATE public.payment_promises SET status_v2 = 'missed' WHERE status = 'broken';
UPDATE public.payment_promises SET status_v2 = 'cancelled' WHERE status = 'cancelled';

-- Drop old column and constraint
ALTER TABLE public.payment_promises DROP COLUMN status;

-- Rename new column to status
ALTER TABLE public.payment_promises RENAME COLUMN status_v2 TO status;

-- Drop old enum type and rename new one
DROP TYPE promise_status;
ALTER TYPE promise_status_v2 RENAME TO promise_status;

-- Set NOT NULL default after migration
ALTER TABLE public.payment_promises ALTER COLUMN status SET NOT NULL;

-- Add source column for tracking how the promise was created
ALTER TABLE public.payment_promises
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai_extracted', 'customer_portal', 'webhook'));

-- Recreate the partial index for the new enum value
DROP INDEX IF EXISTS idx_payment_promises_active;
CREATE INDEX idx_payment_promises_pending ON public.payment_promises(status, promised_date)
    WHERE status = 'pending';
