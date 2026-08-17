-- Migration: 009_communications.sql
-- Description: Create communication_channel, message_direction, delivery_status enums and communications table

CREATE TYPE communication_channel AS ENUM ('email', 'whatsapp', 'call', 'sms');
CREATE TYPE message_direction AS ENUM ('outbound', 'inbound');
CREATE TYPE delivery_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'bounced');

CREATE TABLE public.communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    follow_up_task_id UUID, -- Foreign key to follow_up_tasks added in migration 011
    channel communication_channel NOT NULL,
    direction message_direction NOT NULL DEFAULT 'outbound',
    sender_identifier TEXT,
    recipient_identifier TEXT NOT NULL,
    subject TEXT,
    content TEXT NOT NULL,
    delivery_status delivery_status NOT NULL DEFAULT 'sent',
    external_provider_id TEXT,
    ai_analyzed BOOLEAN NOT NULL DEFAULT FALSE,
    ai_intent TEXT,
    ai_sentiment TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX idx_communications_customer ON public.communications(organization_id, customer_id);
CREATE INDEX idx_communications_invoice ON public.communications(invoice_id);
CREATE INDEX idx_communications_channel ON public.communications(organization_id, channel);
CREATE INDEX idx_communications_status ON public.communications(delivery_status);
CREATE INDEX idx_communications_created_at ON public.communications(organization_id, created_at DESC);
