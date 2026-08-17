-- Migration: 011_follow_up_tasks.sql
-- Description: Create task_status enum, follow_up_tasks queue table, and link communications FK

CREATE TYPE task_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'skipped');

CREATE TABLE public.follow_up_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.follow_up_rules(id) ON DELETE SET NULL,
    channel communication_channel NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    executed_at TIMESTAMPTZ,
    status task_status NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Link follow_up_task_id on communications table
ALTER TABLE public.communications
ADD CONSTRAINT fk_communications_follow_up_task
FOREIGN KEY (follow_up_task_id) REFERENCES public.follow_up_tasks(id)
ON DELETE SET NULL;

-- Trigger for updated_at
CREATE TRIGGER set_follow_up_tasks_updated_at
BEFORE UPDATE ON public.follow_up_tasks
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_follow_up_tasks_pending ON public.follow_up_tasks(status, scheduled_for)
    WHERE status = 'pending';
CREATE INDEX idx_follow_up_tasks_invoice ON public.follow_up_tasks(invoice_id);
CREATE INDEX idx_follow_up_tasks_org ON public.follow_up_tasks(organization_id, status);
CREATE INDEX idx_follow_up_tasks_scheduled ON public.follow_up_tasks(scheduled_for);
