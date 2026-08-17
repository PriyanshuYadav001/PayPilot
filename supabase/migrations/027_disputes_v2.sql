-- Migration: 027_disputes_v2.sql
-- Description: Add source and metadata columns to disputes for AI transcript analysis (Phase 21)

ALTER TABLE public.disputes
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai_extracted', 'ai_transcript', 'customer_portal'));

ALTER TABLE public.disputes
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';