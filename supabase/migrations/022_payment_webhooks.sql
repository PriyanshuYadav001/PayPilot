-- Migration: 022_payment_webhooks.sql
-- Description: Transaction-safe payment webhook processing. Adds idempotent
-- webhook event logging plus SECURITY DEFINER functions that confirm, fail or
-- refund a payment AND reconcile the invoice balance/status AND cancel
-- applicable follow-up tasks inside a single database transaction.

-- ============================================================================
-- 1. Idempotent webhook event log
--    webhook_events already enforces UNIQUE(provider, provider_event_id), which
--    is the duplicate-prevention gate: a replayed event simply fails the insert
--    and is skipped without any side effects.
-- ============================================================================

-- ============================================================================
-- 2. mark_payment_processing
--    "payment initiated" events transition a pending order to processing.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_payment_processing(
    p_payment_id uuid,
    p_raw_payload jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current public.payment_status;
BEGIN
    SELECT status INTO v_current FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_current = 'processing' THEN
        RETURN 'duplicate';
    END IF;
    IF v_current <> 'pending' THEN
        RETURN 'invalid_transition';
    END IF;

    UPDATE public.payments
       SET status = 'processing',
           raw_payload = p_raw_payload
     WHERE id = p_payment_id;

    RETURN 'processing';
END;
$$;

-- ============================================================================
-- 3. confirm_payment_capture
--    "payment successful" events. Row-locks the payment and invoice, credits
--    amount_paid, recomputes amount_due, derives invoice status, and cancels
--    pending/processing follow-up tasks for the invoice. Runs atomically.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirm_payment_capture(
    p_payment_id uuid,
    p_provider_payment_id text,
    p_method public.payment_method,
    p_paid_at timestamptz,
    p_raw_payload jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment RECORD;
    v_invoice RECORD;
    v_new_paid numeric;
    v_new_due numeric;
    v_status public.invoice_status;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_payment.status = 'successful' THEN
        RETURN 'duplicate';
    END IF;
    IF v_payment.status IN ('refunded', 'cancelled') THEN
        RETURN 'invalid_transition';
    END IF;

    UPDATE public.payments
       SET status = 'successful',
           provider_payment_id = p_provider_payment_id,
           method = COALESCE(p_method, v_payment.method),
           paid_at = COALESCE(p_paid_at, timezone('utc', now())),
           raw_payload = p_raw_payload
     WHERE id = p_payment_id;

    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'invoice_not_found';
    END IF;

    -- Payments are never collected on cancelled/voided/written-off invoices;
    -- if such an event still arrives, record it without disturbing amounts.
    IF v_invoice.status IN ('cancelled', 'voided', 'written_off') THEN
        RETURN 'confirmed_no_amount';
    END IF;

    v_new_paid := round((v_invoice.amount_paid + v_payment.amount)::numeric, 2);
    v_new_due := round((v_invoice.total_amount - v_new_paid)::numeric, 2);

    IF v_new_due <= 0 THEN
        v_status := 'paid';
    ELSIF v_invoice.due_date < CURRENT_DATE THEN
        v_status := 'overdue';
    ELSIF v_new_paid > 0 THEN
        v_status := 'partially_paid';
    ELSE
        v_status := v_invoice.status;
    END IF;

    UPDATE public.invoices
       SET amount_paid = v_new_paid,
           amount_due = v_new_due,
           status = v_status,
           is_follow_up_active = FALSE,
           next_follow_up_at = NULL
     WHERE id = v_invoice.id;

    -- Cancel applicable follow-up tasks now that the invoice is paid/collecting.
    UPDATE public.follow_up_tasks
       SET status = 'cancelled',
           error_message = 'Payment received; follow-up cancelled',
           updated_at = timezone('utc', now())
     WHERE invoice_id = v_invoice.id
       AND status IN ('pending', 'processing');

    RETURN 'confirmed';
END;
$$;

-- ============================================================================
-- 4. mark_payment_failed
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_payment_failed(
    p_payment_id uuid,
    p_provider_payment_id text,
    p_raw_payload jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current public.payment_status;
BEGIN
    SELECT status INTO v_current FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_current IN ('successful', 'refunded') THEN
        RETURN 'duplicate';
    END IF;

    UPDATE public.payments
       SET status = 'failed',
           provider_payment_id = p_provider_payment_id,
           raw_payload = p_raw_payload
     WHERE id = p_payment_id;

    RETURN 'failed';
END;
$$;

-- ============================================================================
-- 5. mark_payment_refunded
--    Reverses the credited amount: amount_paid decreases, amount_due and the
--    invoice status are recomputed, and follow-ups resume when fully refunded.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_payment_refunded(
    p_payment_id uuid,
    p_raw_payload jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment RECORD;
    v_invoice RECORD;
    v_new_paid numeric;
    v_new_due numeric;
    v_status public.invoice_status;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_payment.status = 'refunded' THEN
        RETURN 'duplicate';
    END IF;

    UPDATE public.payments
       SET status = 'refunded',
           raw_payload = p_raw_payload
     WHERE id = p_payment_id;

    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_payment.invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'invoice_not_found';
    END IF;

    v_new_paid := GREATEST(round((v_invoice.amount_paid - v_payment.amount)::numeric, 2), 0);
    v_new_due := round((v_invoice.total_amount - v_new_paid)::numeric, 2);

    IF v_new_due <= 0 THEN
        v_status := 'paid';
    ELSIF v_invoice.due_date < CURRENT_DATE THEN
        v_status := 'overdue';
    ELSIF v_new_paid > 0 THEN
        v_status := 'partially_paid';
    ELSE
        v_status := 'sent';
    END IF;

    UPDATE public.invoices
       SET amount_paid = v_new_paid,
           amount_due = v_new_due,
           status = v_status,
           is_follow_up_active = CASE WHEN v_new_paid <= 0 THEN TRUE ELSE is_follow_up_active END
     WHERE id = v_invoice.id;

    RETURN 'refunded';
END;
$$;

-- ============================================================================
-- 6. Grant execution to the server's service role only.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.mark_payment_processing(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_capture(uuid, text, public.payment_method, timestamptz, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_payment_failed(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_payment_refunded(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_payment_processing(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_payment_capture(uuid, text, public.payment_method, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_payment_failed(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_payment_refunded(uuid, jsonb) TO service_role;
