-- Migration: 028_public_payment_access.sql
-- Description: Expose only token-scoped payment-page fields to public callers.
--
-- Anonymous SELECT policies on invoices/payment_links cannot be scoped to a
-- token and would expose every tenant's rows. The Express public route remains
-- the primary path; this SECURITY DEFINER function is a safe, narrow fallback
-- for clients that need to load the payment page directly from Supabase.

CREATE OR REPLACE FUNCTION public.get_public_payment_link(p_token uuid)
RETURNS TABLE (
    payment_status text,
    payment_amount numeric,
    payment_currency varchar(3),
    payment_expires_at timestamptz,
    payment_short_url text,
    invoice_number text,
    invoice_issue_date date,
    invoice_due_date date,
    invoice_total_amount numeric,
    invoice_amount_paid numeric,
    invoice_amount_due numeric,
    invoice_status public.invoice_status,
    organization_name text,
    customer_contact_name text,
    customer_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        pl.status::text,
        pl.amount,
        pl.currency,
        pl.expires_at,
        pl.short_url,
        i.invoice_number,
        i.issue_date,
        i.due_date,
        i.total_amount,
        i.amount_paid,
        i.amount_due,
        i.status,
        o.name,
        c.contact_name,
        c.email
    FROM public.payment_links AS pl
    JOIN public.invoices AS i ON i.id = pl.invoice_id
    JOIN public.organizations AS o ON o.id = pl.organization_id
    JOIN public.customers AS c ON c.id = i.customer_id
    WHERE pl.public_token = p_token
    LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_payment_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_payment_link(uuid) TO anon, authenticated;
