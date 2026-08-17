-- Migration: 007_payments.sql
-- Description: Create payment_method, payment_status enums and payments table

CREATE TYPE payment_method AS ENUM ('upi', 'card', 'netbanking', 'wallet', 'bank_transfer', 'cheque', 'cash', 'other');
CREATE TYPE payment_status AS ENUM ('captured', 'failed', 'refunded', 'pending');

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    payment_link_id UUID, -- Foreign key to payment_links added in migration 008
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    method payment_method NOT NULL DEFAULT 'upi',
    status payment_status NOT NULL DEFAULT 'captured',
    provider TEXT NOT NULL DEFAULT 'razorpay',
    provider_payment_id TEXT,
    provider_order_id TEXT,
    reference_number TEXT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX idx_payments_org ON public.payments(organization_id);
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_payments_org_status ON public.payments(organization_id, status);
CREATE INDEX idx_payments_paid_at ON public.payments(organization_id, paid_at);
CREATE INDEX idx_payments_provider_id ON public.payments(provider, provider_payment_id);
