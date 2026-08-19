import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type {
  FollowUpRule,
  PromisedPayment,
} from '../../shared/types';

export interface FollowUpRuleInput {
  organizationId: string;
  name: string;
  channel: 'email' | 'whatsapp';
  delayDays: number;
  template: string;
  enabled?: boolean;
}

export interface FollowUpScheduleInput {
  invoiceId: string;
  customerId: string;
  promisedDate?: string;
  channel: 'email' | 'whatsapp';
}

export interface FollowUpResult {
  id: string;
  invoiceId: string;
  customerId: string;
  channel: string;
  scheduledAt: string;
  status: string;
  attemptNumber: number;
}

export class FollowUpService {
  constructor() {}

  async createFollowUpRule(input: FollowUpRuleInput): Promise<FollowUpRule> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
      .from('follow_up_rules')
      .insert({
        organization_id: input.organizationId,
        name: input.name,
        channel: input.channel,
        delay_days: input.delayDays,
        template: input.template,
        enabled: input.enabled ?? true,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating follow-up rule:', error);
      throw error;
    }

    return data as FollowUpRule;
  }

  async getFollowUpRules(
    organizationId: string
  ): Promise<FollowUpRule[]> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
      .from('follow_up_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('enabled', true);

    if (error) {
      logger.error('Error fetching follow-up rules:', error);
      throw error;
    }

    return data as FollowUpRule[];
  }

  async scheduleFollowUps(input: FollowUpScheduleInput): Promise<FollowUpResult[]> {
    const {
      supabase,
    } = supabaseServer();

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', input.invoiceId)
      .single();

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Check if invoice is already paid
    if (invoice.status === 'paid') {
      throw new Error('Cannot schedule follow-ups for paid invoice');
    }

    const rules = await this.getFollowUpRules(invoice.organization_id);

    const results: FollowUpResult[] = [];

    for (const rule of rules) {
      // Calculate scheduled-at date
      const dueDate = new Date(invoice.due_date);
      const scheduledAt = new Date(
        Date.now() + rule.delay_days * 24 * 60 * 60 * 1000
      ).toISOString();

      // Check if promised date should affect scheduling
      let effectiveDelay = rule.delayDays;

      if (input.promisedDate) {
        const promised = new Date(input.promisedDate);
        const due = new Date(invoice.due_date);
        // If promised date is after due date, use the promised date as reference
        if (promised > due) {
          effectiveDelay = 0; // Will be handled separately
        }
      }

      const { data, error } = await supabase
        .from('follow_ups')
        .insert({
          organization_id: invoice.organization_id,
          invoice_id: input.invoiceId,
          customer_id: input.customerId,
          channel: rule.channel,
          scheduled_at: scheduledAt,
          status: 'scheduled',
          attempt_number: 1,
          template: rule.template,
        })
        .select()
        .single();

      if (error) {
        logger.error('Error scheduling follow-up:', error);
        throw error;
      }

      results.push({
        id: data.id,
        invoiceId: data.invoice_id,
        customerId: data.customer_id,
        channel: data.channel,
        scheduledAt: data.scheduled_at,
        status: data.status,
        attemptNumber: data.attempt_number,
      });
    }

    return results;
  }

  async getScheduledFollowUps(
    organizationId: string,
    status?: string
  ): Promise<FollowUpResult[]> {
    const {
      supabase,
    } = supabaseServer();

    let query = supabase
      .from('follow_ups')
      .select('*, invoices(due_date)')
      .eq('organization_id', organizationId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('scheduled_at', { ascending: true });

    if (error) {
      logger.error('Error fetching scheduled follow-ups:', error);
      throw error;
    }

    return (data as any[]).map((fu) => ({
      id: fu.id,
      invoiceId: fu.invoice_id,
      customerId: fu.customer_id,
      channel: fu.channel,
      scheduledAt: fu.scheduled_at,
      status: fu.status,
      attemptNumber: fu.attempt_number,
    }));
  }

  async markFollowUpSent(
    followUpId: string
  ): Promise<FollowUpResult> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
      .from('follow_ups')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        attempt_number: supabase.rpc('increment_attempt', { id: followUpId }),
      })
      .eq('id', followUpId)
      .select()
      .single();

    if (error) {
      logger.error('Error marking follow-up sent:', error);
      throw error;
    }

    return {
      id: data.id,
      invoiceId: data.invoice_id,
      customerId: data.customer_id,
      channel: data.channel,
      scheduledAt: data.scheduled_at,
      status: data.status,
      attemptNumber: data.attempt_number,
    };
  }

  async checkAndCancelPaidFollowUps(invoiceId: string): Promise<boolean> {
    const {
      supabase,
    } = supabaseServer();

    // Check invoice status
    const { data: invoice } = await supabase
      .from('invoices')
      .select('status')
      .eq('id', invoiceId)
      .single();

    if (!invoice || invoice.status !== 'paid') {
      return false; // Invoice not paid, no cancellation needed
    }

    // Cancel all scheduled follow-ups for this invoice
    const { error } = await supabase
      .from('follow_ups')
      .update({ status: 'cancelled' })
      .eq('invoice_id', invoiceId)
      .eq('status', 'scheduled');

    if (error) {
      logger.error('Error cancelling follow-ups:', error);
      return false;
    }

    return true;
  }

  async markPromisedPayment(
    invoiceId: string,
    promisedDate: string,
    fulfilled: boolean
  ): Promise<PromisedPayment> {
    const {
      supabase,
    } = supabaseServer();

    const { data: promisedPayment } = await supabase
      .from('promised_payments')
      .upsert(
        {
          invoice_id: invoiceId,
          promised_date: promisedDate,
          status: fulfilled ? 'fulfilled' : 'missed',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: ['invoice_id'],
        }
      )
      .select()
      .single();

    if (!promisedPayment) {
      throw new Error('Error marking promised payment');
    }

    // If fulfilled, cancel any scheduled follow-ups
    if (fulfilled) {
      await this.checkAndCancelPaidFollowUps(invoiceId);
    }

    return promisedPayment as PromisedPayment;
  }

  async getPromisedPayments(
    organizationId: string
  ): Promise<PromisedPayment[]> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
      .from('promised_payments')
      .select('*, invoices(due_date, status)')
      .eq('organization_id', organizationId);

    if (error) {
      logger.error('Error fetching promised payments:', error);
      throw error;
    }

    return data as PromisedPayment[];
  }
}