-- Migration: 020_invoice_storage.sql
-- Description: Private storage bucket + tenant-scoped policies for invoice documents

-- ============================================================================
-- 1. Private bucket
-- ============================================================================

-- Create a private bucket (never exposed publicly). File paths follow:
--     <organization_id>/invoices/<invoice_id>/file.<ext>
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices-private', 'invoices-private', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Tenant-scoped RLS policies on storage.objects
-- ============================================================================
-- Defense-in-depth: even though the service role bypasses RLS, users with the
-- anon/authenticated key must only reach objects whose first path segment is
-- an organization they actively belong to.

CREATE POLICY "Invoice files: tenant-scoped insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'invoices-private'
        AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_organizations())
    );

CREATE POLICY "Invoice files: tenant-scoped read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'invoices-private'
        AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_organizations())
    );

CREATE POLICY "Invoice files: tenant-scoped update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'invoices-private'
        AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_organizations())
    )
    WITH CHECK (
        bucket_id = 'invoices-private'
        AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_organizations())
    );

CREATE POLICY "Invoice files: tenant-scoped delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'invoices-private'
        AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_organizations())
    );
