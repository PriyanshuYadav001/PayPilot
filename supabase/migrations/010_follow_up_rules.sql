-- Migration: 010_follow_up_rules.sql
-- Description: Create follow_up_rules cadence configuration table

CREATE TABLE public.follow_up_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    days_relative_to_due INTEGER NOT NULL, -- Negative for before due date, 0 for on due date, Positive for overdue
    channel communication_channel NOT NULL,
    template_subject TEXT,
    template_body TEXT NOT NULL,
    template_id_external TEXT,
    escalation_priority INTEGER NOT NULL DEFAULT 1 CHECK (escalation_priority >= 1),
    include_payment_link BOOLEAN NOT NULL DEFAULT TRUE,
    include_qr_code BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger for updated_at
CREATE TRIGGER set_follow_up_rules_updated_at
BEFORE UPDATE ON public.follow_up_rules
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_follow_up_rules_org ON public.follow_up_rules(organization_id, is_active);
CREATE INDEX idx_follow_up_rules_priority ON public.follow_up_rules(organization_id, escalation_priority);
CREATE INDEX idx_follow_up_rules_offset ON public.follow_up_rules(organization_id, days_relative_to_due);
