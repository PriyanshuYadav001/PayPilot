-- Migration: 004_customers.sql
-- Description: Create customers debtor directory table

CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    whatsapp_number TEXT,
    gstin TEXT,
    billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    credit_period_days INTEGER NOT NULL DEFAULT 30 CHECK (credit_period_days >= 0),
    is_dnd BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, email)
);

-- Trigger for updated_at
CREATE TRIGGER set_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_customers_org ON public.customers(organization_id);
CREATE INDEX idx_customers_org_email ON public.customers(organization_id, email);
CREATE INDEX idx_customers_org_phone ON public.customers(organization_id, phone);
CREATE INDEX idx_customers_org_whatsapp ON public.customers(organization_id, whatsapp_number);
