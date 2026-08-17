-- Migration: 015_webhook_events.sql
-- Description: Create webhook_events idempotent event log table

CREATE TABLE public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'razorpay', 'twilio', 'meta_whatsapp', 'resend'
    event_type TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    is_processed BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(provider, provider_event_id)
);

-- Indexes
CREATE INDEX idx_webhook_events_unprocessed ON public.webhook_events(is_processed, created_at)
    WHERE is_processed = FALSE;
CREATE INDEX idx_webhook_events_org ON public.webhook_events(organization_id);
CREATE INDEX idx_webhook_events_provider_id ON public.webhook_events(provider, provider_event_id);
