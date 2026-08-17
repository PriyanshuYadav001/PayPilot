-- Migration: 014_calls.sql
-- Description: Create call_status enum and calls voice log table

CREATE TYPE call_status AS ENUM ('queued', 'ringing', 'in_progress', 'completed', 'busy', 'no_answer', 'failed');

CREATE TABLE public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    follow_up_task_id UUID REFERENCES public.follow_up_tasks(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'twilio',
    provider_call_id TEXT,
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    status call_status NOT NULL DEFAULT 'queued',
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    recording_url TEXT,
    transcript TEXT,
    ai_summary TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX idx_calls_org_customer ON public.calls(organization_id, customer_id);
CREATE INDEX idx_calls_invoice ON public.calls(invoice_id);
CREATE INDEX idx_calls_status ON public.calls(status);
CREATE INDEX idx_calls_provider_call_id ON public.calls(provider, provider_call_id);
