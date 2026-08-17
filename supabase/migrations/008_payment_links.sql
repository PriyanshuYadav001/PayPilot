-- Migration: 008_payment_links.sql
-- Description: Create payment_link_status enum, payment_links table and link payments FK

CREATE TYPE payment_link_status AS ENUM ('active', 'paid', 'expired', 'cancelled');

CREATE TABLE public.payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    provider_link_id TEXT NOT NULL,
    short_url TEXT NOT NULL,
    qr_code_url TEXT,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status payment_link_status NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Link payment_link_id FK on payments table
ALTER TABLE public.payments
ADD CONSTRAINT fk_payments_payment_link
FOREIGN KEY (payment_link_id) REFERENCES public.payment_links(id)
ON DELETE SET NULL;

-- Trigger for updated_at
CREATE TRIGGER set_payment_links_updated_at
BEFORE UPDATE ON public.payment_links
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_payment_links_org ON public.payment_links(organization_id);
CREATE INDEX idx_payment_links_invoice ON public.payment_links(invoice_id);
CREATE INDEX idx_payment_links_status ON public.payment_links(status);
CREATE INDEX idx_payment_links_provider_link_id ON public.payment_links(provider, provider_link_id);
