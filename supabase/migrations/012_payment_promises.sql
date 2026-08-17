-- Migration: 012_payment_promises.sql
-- Description: Create promise_status enum and payment_promises table for AI tracking

CREATE TYPE promise_status AS ENUM ('active', 'kept', 'broken', 'cancelled');

CREATE TABLE public.payment_promises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    communication_id UUID REFERENCES public.communications(id) ON DELETE SET NULL,
    promised_date DATE NOT NULL,
    promised_amount NUMERIC(15, 2) CHECK (promised_amount > 0),
    confidence_score NUMERIC(4, 3) CHECK (confidence_score >= 0.000 AND confidence_score <= 1.000),
    status promise_status NOT NULL DEFAULT 'active',
    ai_extracted_quote TEXT,
    notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger for updated_at
CREATE TRIGGER set_payment_promises_updated_at
BEFORE UPDATE ON public.payment_promises
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_payment_promises_active ON public.payment_promises(status, promised_date)
    WHERE status = 'active';
CREATE INDEX idx_payment_promises_invoice ON public.payment_promises(invoice_id);
CREATE INDEX idx_payment_promises_customer ON public.payment_promises(customer_id);
CREATE INDEX idx_payment_promises_org ON public.payment_promises(organization_id, status);
