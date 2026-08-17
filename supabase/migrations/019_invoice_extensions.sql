-- Migration: 019_invoice_extensions.sql
-- Description: Add sent/cancelled invoice statuses and flat discount to invoices

-- Extend the invoice_status enum with the Phase 7 status set.
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Add flat discount amount (subtracted from subtotal + tax to compute total).
ALTER TABLE public.invoices
    ADD COLUMN discount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0);
