-- Migration: 017_usage_records.sql
-- Description: Create usage_metric enum and usage_records quota metering table

CREATE TYPE usage_metric AS ENUM ('invoices_created', 'whatsapp_sent', 'emails_sent', 'calls_made', 'ai_analyses');

CREATE TABLE public.usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric usage_metric NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, metric, period_start)
);

-- Trigger for updated_at
CREATE TRIGGER set_usage_records_updated_at
BEFORE UPDATE ON public.usage_records
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_usage_records_org_metric ON public.usage_records(organization_id, metric, period_start);
