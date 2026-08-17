-- Migration: 026_calls_v2.sql
-- Description: Add metadata and summary columns to calls table for Phase 20

ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Rename ai_summary to summary for cleaner API alignment
ALTER TABLE public.calls
RENAME COLUMN ai_summary TO summary;
