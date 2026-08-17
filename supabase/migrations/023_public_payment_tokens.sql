-- Migration: 023_public_payment_tokens.sql
-- Description: Add a secure, public-facing token to payment_links so the
-- customer payment page (/pay/:token) never exposes internal UUIDs such as the
-- payment link id, invoice id, or organization id.

-- Backfill existing payment links before enforcing NOT NULL.
ALTER TABLE public.payment_links
ADD COLUMN IF NOT EXISTS public_token uuid;

UPDATE public.payment_links
SET public_token = gen_random_uuid()
WHERE public_token IS NULL;

ALTER TABLE public.payment_links
ALTER COLUMN public_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_links_public_token
ON public.payment_links(public_token);
