-- Migration: 005_invoices.sql
-- Description: Create invoice_status enum and invoices table

CREATE TYPE invoice_status AS ENUM (
    'draft',
    'issued',
    'pending',
    'partially_paid',
    'paid',
    'overdue',
    'disputed',
    'voided',
    'written_off'
);

CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    subtotal NUMERIC(15, 2) NOT NULL CHECK (subtotal >= 0),
    tax_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (tax_total >= 0),
    total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
    amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    amount_due NUMERIC(15, 2) NOT NULL CHECK (amount_due >= 0),
    status invoice_status NOT NULL DEFAULT 'draft',
    pdf_url TEXT,
    notes TEXT,
    terms_and_conditions TEXT,
    is_follow_up_active BOOLEAN NOT NULL DEFAULT TRUE,
    follow_up_paused_until TIMESTAMPTZ,
    last_follow_up_at TIMESTAMPTZ,
    next_follow_up_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_amount_integrity CHECK (amount_paid + amount_due = total_amount),
    UNIQUE(organization_id, invoice_number)
);

-- Trigger for updated_at
CREATE TRIGGER set_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_invoices_org_status ON public.invoices(organization_id, status);
CREATE INDEX idx_invoices_org_due_date ON public.invoices(organization_id, due_date);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX idx_invoices_next_follow_up ON public.invoices(is_follow_up_active, next_follow_up_at)
    WHERE is_follow_up_active = TRUE AND next_follow_up_at IS NOT NULL;
