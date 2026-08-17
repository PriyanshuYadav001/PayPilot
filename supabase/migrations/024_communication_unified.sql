-- Migration: 024_communication_unified.sql
-- Description: Align the communications table with the unified communication
-- architecture field names (message / status / provider_message_id / sent_at)
-- and add provider-message idempotency.

-- Unified field names. Column renames are transparent to indexes; the enum
-- type is renamed to match its new column.
ALTER TABLE public.communications RENAME COLUMN content TO message;
ALTER TABLE public.communications RENAME COLUMN delivery_status TO status;
ALTER TABLE public.communications RENAME COLUMN external_provider_id TO provider_message_id;

ALTER TYPE public.delivery_status RENAME TO communication_status;

-- When the message was dispatched / received. Backfilled from created_at and
-- enforced for all future rows.
ALTER TABLE public.communications
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

UPDATE public.communications
SET sent_at = created_at
WHERE sent_at IS NULL;

ALTER TABLE public.communications
ALTER COLUMN sent_at SET DEFAULT timezone('utc'::text, now()),
ALTER COLUMN sent_at SET NOT NULL;

-- Recreate the status index under the renamed column.
DROP INDEX IF EXISTS idx_communications_status;
CREATE INDEX IF NOT EXISTS idx_communications_status ON public.communications(status);

-- Idempotency: a provider message id may only map to a single row so replayed
-- provider events (email / WhatsApp / call callbacks) never create duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_communications_provider_message
ON public.communications(provider_message_id)
WHERE provider_message_id IS NOT NULL;
