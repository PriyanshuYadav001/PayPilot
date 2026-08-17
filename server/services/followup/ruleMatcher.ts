/**
 * Rule matcher: finds applicable rules for invoices and creates follow_up_tasks.
 * Runs periodically by the scheduler to detect new overdue invoices and schedule tasks.
 */

import { supabaseServer } from '../../lib/supabaseClient';
import { logger } from '../../utils/logger';
import type { FollowUpRule, FollowUpTask } from '../../../shared/types';

interface InvoiceRow {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_number: string;
  due_date: string;
  amount_due: number;
  currency: string;
  status: string;
  is_follow_up_active: boolean;
  follow_up_paused_until: string | null;
  customer: Record<string, unknown> | null;
}

interface RuleRow {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  days_relative_to_due: number;
  channel: string;
  template_subject: string | null;
  template_body: string;
  escalation_priority: number;
  include_payment_link: boolean;
  include_qr_code: boolean;
}

interface TaskRow {
  id: string;
  rule_id: string;
  invoice_id: string;
  scheduled_for: string;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const diffMs = b.getTime() - a.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function startOfDay(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Scan all active invoices and create pending tasks for rules that match today's
 * offset relative to the due date. Skips paused invoices, DND customers, and
 * rules that already have a task for this invoice+rule+date combination.
 *
 * Returns the number of tasks created.
 */
export async function matchRulesAndCreateTasks(): Promise<number> {
  const today = startOfDay(new Date().toISOString());

  // 1. Load all active rules across all organizations
  const { data: rules, error: rulesErr } = await supabaseServer
    .from('follow_up_rules')
    .select('*')
    .eq('is_active', true);

  if (rulesErr) {
    logger.error('matchRules: failed to load rules', rulesErr.message);
    return 0;
  }

  const activeRules = (rules ?? []) as RuleRow[];
  if (activeRules.length === 0) return 0;

  // Group rules by org for efficient querying
  const rulesByOrg = new Map<string, RuleRow[]>();
  for (const rule of activeRules) {
    const list = rulesByOrg.get(rule.organization_id) ?? [];
    list.push(rule);
    rulesByOrg.set(rule.organization_id, list);
  }

  let tasksCreated = 0;

  for (const [orgId, orgRules] of rulesByOrg) {
    // 2. Load eligible invoices for this org:
    //    - status in (sent, overdue, partially_paid)
    //    - is_follow_up_active = true
    //    - follow_up_paused_until is null or in the past
    const { data: invoices, error: invErr } = await supabaseServer
      .from('invoices')
      .select(`
        id, organization_id, customer_id, invoice_number, due_date,
        amount_due, currency, status, is_follow_up_active, follow_up_paused_until,
        customer:customers(contact_name, company_name, is_dnd)
      `)
      .eq('organization_id', orgId)
      .in('status', ['sent', 'overdue', 'partially_paid'])
      .eq('is_follow_up_active', true)
      .or('follow_up_paused_until.is.null,follow_up_paused_until.lt.' + today);

    if (invErr) {
      logger.error(`matchRules: failed to load invoices for org ${orgId}`, invErr.message);
      continue;
    }

    const invoiceRows = (invoices ?? []) as unknown as InvoiceRow[];

    for (const invoice of invoiceRows) {
      // Skip DND customers
      const customer = invoice.customer;
      if (customer?.is_dnd === true) continue;

      const daysFromDue = daysBetween(invoice.due_date, today);

      for (const rule of orgRules) {
        // Only match rules whose offset equals today's distance from due date
        if (rule.days_relative_to_due !== daysFromDue) continue;

        // Check for duplicate: does a task already exist for this invoice+rule+today?
        const { data: existing } = await supabaseServer
          .from('follow_up_tasks')
          .select('id')
          .eq('organization_id', orgId)
          .eq('invoice_id', invoice.id)
          .eq('rule_id', rule.id)
          .gte('created_at', today)
          .maybeSingle();

        if (existing) continue;

        // Create the task
        const { error: insertErr } = await supabaseServer
          .from('follow_up_tasks')
          .insert({
            organization_id: orgId,
            invoice_id: invoice.id,
            rule_id: rule.id,
            channel: rule.channel,
            scheduled_for: new Date().toISOString(),
            status: 'pending',
            retry_count: 0,
            max_retries: 3,
            metadata: {
              invoiceNumber: invoice.invoice_number,
              amountDue: invoice.amount_due,
              currency: invoice.currency,
              customerName: (customer?.contact_name as string) ?? 'Customer',
              companyName: (customer?.company_name as string) ?? 'Business',
            },
          });

        if (insertErr) {
          logger.error(`matchRules: failed to create task for invoice ${invoice.id}`, insertErr.message);
          continue;
        }

        tasksCreated++;
        logger.debug(`matchRules: created task for invoice ${invoice.invoice_number}, rule ${rule.name}`);
      }
    }
  }

  if (tasksCreated > 0) {
    logger.info(`matchRules: created ${tasksCreated} follow-up tasks`);
  }

  return tasksCreated;
}
