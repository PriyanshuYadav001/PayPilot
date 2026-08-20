import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Supabase Migrations Verification', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');

  const expectedMigrations = [
    '001_profiles.sql',
    '002_organizations.sql',
    '003_organization_members.sql',
    '004_customers.sql',
    '005_invoices.sql',
    '006_invoice_items.sql',
    '007_payments.sql',
    '008_payment_links.sql',
    '009_communications.sql',
    '010_follow_up_rules.sql',
    '011_follow_up_tasks.sql',
    '012_payment_promises.sql',
    '013_disputes.sql',
    '014_calls.sql',
    '015_webhook_events.sql',
    '016_subscriptions.sql',
    '017_usage_records.sql',
    '018_rls_policies.sql',
    '019_invoice_extensions.sql',
    '020_invoice_storage.sql',
    '021_payment_status.sql',
    '022_payment_webhooks.sql',
    '023_public_payment_tokens.sql',
    '024_communication_unified.sql',
    '025_payment_promises_v2.sql',
    '026_calls_v2.sql',
    '027_disputes_v2.sql',
    '028_public_payment_access.sql',
  ];

  it('contains all 28 sequential migration files', () => {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    expect(files).toEqual(expectedMigrations);
  });

  it('all migration files contain non-empty SQL content', () => {
    for (const filename of expectedMigrations) {
      const filePath = path.join(migrationsDir, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(50);
      expect(content).toMatch(/CREATE|ALTER/i);
    }
  });

  it('migration 001 creates extensions and updated_at trigger helper', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '001_profiles.sql'), 'utf-8');
    expect(content).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    expect(content).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    expect(content).toContain('handle_updated_at()');
    expect(content).toContain('CREATE TABLE public.profiles');
  });

  it('all tenant tables enforce organization_id multi-tenant foreign keys', () => {
    const tenantMigrations = [
      '002_organizations.sql',
      '003_organization_members.sql',
      '004_customers.sql',
      '005_invoices.sql',
      '007_payments.sql',
      '008_payment_links.sql',
      '009_communications.sql',
      '010_follow_up_rules.sql',
      '011_follow_up_tasks.sql',
      '012_payment_promises.sql',
      '013_disputes.sql',
      '014_calls.sql',
      '015_webhook_events.sql',
      '016_subscriptions.sql',
      '017_usage_records.sql',
    ];

    for (const file of tenantMigrations) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      if (file === '002_organizations.sql') {
        expect(content).toContain('CREATE TABLE public.organizations');
      } else {
        expect(content).toContain('organization_id UUID');
        expect(content).toContain('REFERENCES public.organizations(id)');
      }
    }
  });

  it('financial tables use NUMERIC(15, 2) and positive check constraints', () => {
    const invoiceSql = fs.readFileSync(path.join(migrationsDir, '005_invoices.sql'), 'utf-8');
    expect(invoiceSql).toContain('NUMERIC(15, 2)');
    expect(invoiceSql).toContain('check_amount_integrity CHECK (amount_paid + amount_due = total_amount)');

    const paymentSql = fs.readFileSync(path.join(migrationsDir, '007_payments.sql'), 'utf-8');
    expect(paymentSql).toContain('amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0)');

    const paymentLinksSql = fs.readFileSync(path.join(migrationsDir, '008_payment_links.sql'), 'utf-8');
    expect(paymentLinksSql).toContain('amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0)');
  });

  it('migration 021 extends payment status lifecycle and adds duplicate-payment protection', () => {
    const paymentSql = fs.readFileSync(path.join(migrationsDir, '021_payment_status.sql'), 'utf-8');
    expect(paymentSql).toContain("ADD VALUE IF NOT EXISTS 'processing'");
    expect(paymentSql).toContain("ADD VALUE IF NOT EXISTS 'successful'");
    expect(paymentSql).toContain("ADD VALUE IF NOT EXISTS 'cancelled'");
    expect(paymentSql).toContain('idempotency_key UUID');
    expect(paymentSql).toContain('CREATE UNIQUE INDEX');
    expect(paymentSql).toContain('provider_order_id');
  });

  it('migration 022 processes payment webhooks transaction-safely with RPCs', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '022_payment_webhooks.sql'), 'utf-8');

    expect(sql).toContain('mark_payment_processing');
    expect(sql).toContain('confirm_payment_capture');
    expect(sql).toContain('mark_payment_failed');
    expect(sql).toContain('mark_payment_refunded');
    expect(sql).toContain('SECURITY DEFINER');

    // Row-locking prevents two concurrent webhooks from double-crediting.
    expect(sql).toContain('FOR UPDATE');

    // Invoice balance reconciliation is derived from payment.amount.
    expect(sql).toContain('amount_paid');
    expect(sql).toContain('amount_due');
    expect(sql).toContain('total_amount');

    // Follow-up tasks are cancelled once a payment succeeds.
    expect(sql).toContain('follow_up_tasks');
    expect(sql).toContain("status IN ('pending', 'processing')");

    // Idempotency: already-applied events return 'duplicate' and skip side effects.
    expect(sql).toContain("RETURN 'duplicate'");

    // RPCs are only executable by the service role.
    expect(sql).toContain('REVOKE EXECUTE');
    expect(sql).toContain('GRANT EXECUTE');
    expect(sql).toContain('TO service_role');
  });

  it('migration 023 adds a secure public token to payment links', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '023_public_payment_tokens.sql'), 'utf-8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS public_token uuid');
    expect(sql).toContain('gen_random_uuid()');
    expect(sql).toContain('ALTER COLUMN public_token SET NOT NULL');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_links_public_token');
    expect(sql).toContain('ON public.payment_links(public_token)');
  });

  it('migration 024 aligns the communications table with the unified field names', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '024_communication_unified.sql'), 'utf-8');
    expect(sql).toContain('RENAME COLUMN content TO message');
    expect(sql).toContain('RENAME COLUMN delivery_status TO status');
    expect(sql).toContain('RENAME COLUMN external_provider_id TO provider_message_id');
    expect(sql).toContain('RENAME TO communication_status');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ');
    expect(sql).toContain('sent_at = created_at');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_communications_provider_message');
    expect(sql).toContain('ON public.communications(provider_message_id)');
  });

  it('migration 018 enables RLS on all 17 domain tables and defines security policies', () => {
    const rlsSql = fs.readFileSync(path.join(migrationsDir, '018_rls_policies.sql'), 'utf-8');
    const allTables = [
      'profiles',
      'organizations',
      'organization_members',
      'customers',
      'invoices',
      'invoice_items',
      'payments',
      'payment_links',
      'communications',
      'follow_up_rules',
      'follow_up_tasks',
      'payment_promises',
      'disputes',
      'calls',
      'webhook_events',
      'subscriptions',
      'usage_records',
    ];

    for (const table of allTables) {
      expect(rlsSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }

    expect(rlsSql).toContain('get_auth_user_organizations()');
    expect(rlsSql).toContain('is_org_admin(');
  });
});
