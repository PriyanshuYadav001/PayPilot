-- Migration: 013_disputes.sql
-- Description: Create dispute_status enum and disputes table

CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved_rejected', 'resolved_credited', 'resolved_paid');

CREATE TABLE public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    communication_id UUID REFERENCES public.communications(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'general', -- 'wrong_amount', 'service_issue', 'tax_error', 'unauthorized', 'other'
    reason TEXT NOT NULL,
    status dispute_status NOT NULL DEFAULT 'open',
    resolution_notes TEXT,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger for updated_at
CREATE TRIGGER set_disputes_updated_at
BEFORE UPDATE ON public.disputes
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_disputes_org_status ON public.disputes(organization_id, status);
CREATE INDEX idx_disputes_invoice ON public.disputes(invoice_id);
CREATE INDEX idx_disputes_customer ON public.disputes(customer_id);
CREATE INDEX idx_disputes_resolved_by ON public.disputes(resolved_by);
