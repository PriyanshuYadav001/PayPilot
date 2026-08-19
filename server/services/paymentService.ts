import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type {
  Payment,
  PaymentStatus,
  PaymentLink,
} from '../../shared/types';

export interface PaymentLinkInput {
  invoiceId: string;
  customerId: string;
  provider: 'razorpay';
  amount?: number;
  currency?: string;
  expireDays?: number;
}

export interface PaymentLinkResult {
  id: string;
  token: string;
  url: string;
  amount: number;
  currency: string;
  expires_at: string;
  status: string;
}

export interface PaymentCreateInput {
  invoiceId: string;
  customerId: string;
  provider: 'razorpay';
  amount: number;
  currency?: string;
}

export interface PaymentWebhookInput {
  provider: string;
  provider_payment_id: string;
  provider_event_id: string;
  event: string;
  status?: string;
}

export class PaymentService {
  constructor() {}

  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult> {
    const {
      supabase,
      user,
    } = supabaseServer();

    const {
      data: { user: authenticatedUser },
    } = await supabase.auth.getUser();

    if (!authenticatedUser) {
      throw new Error('Unauthenticated');
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', authenticatedUser.id)
      .single();

    if (!org) {
      throw new Error('Organization not found');
    }

    const amount = input.amount || 0;
    const currency = input.currency || 'INR';
    const expireDays = input.expireDays || 7;
    const expiresAt = new Date(
      Date.now() + expireDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Create payment link via provider ( Razorpay, etc.)
    // For now, we create a placeholder record
    const { data, error } = await supabase
      .from('payment_links')
      .insert({
        organization_id: org.id,
        invoice_id: input.invoiceId,
        customer_id: input.customerId,
        token: Math.random().toString(36).substring(2, 15),
        url: `${process.env.API_URL}/public/payment-links/${Math.random().toString(36).substring(2, 15)}/pay`,
        amount,
        currency,
        expires_at: expiresAt,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating payment link:', error);
      throw error;
    }

    // Also create a payment record
    await supabase.from('payments').insert({
      organization_id: org.id,
      invoice_id: input.invoiceId,
      amount,
      currency,
      provider: 'razorpay',
      provider_payment_id: data.token,
      status: 'pending',
    });

    return {
      id: data.id,
      token: data.token,
      url: data.url,
      amount: data.amount,
      currency: data.currency,
      expires_at: data.expires_at,
      status: data.status,
    } as PaymentLinkResult;
  }

  async getPaymentLinks(
    invoiceId: string
  ): Promise<PaymentLinkResult[]> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
      .from('payment_links')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching payment links:', error);
      throw error;
    }

    return (data as any[]).map((link) => ({
      id: link.id,
      token: link.token,
      url: link.url,
      amount: link.amount,
      currency: link.currency,
      expires_at: link.expires_at,
      status: link.status,
    }));
  }

  async processWebhook(input: PaymentWebhookInput): Promise<{
    payment: Payment;
    invoice: Invoice;
    duplicate: boolean;
  }> {
    const {
      supabase,
    } = supabaseServer();

    // Check for duplicate event
    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('provider_payment_id', input.provider_payment_id)
      .maybeSingle();

    let payment: Payment;
    let duplicate = false;

    if (existing) {
      duplicate = true;
      payment = existing as Payment;
    } else {
      // Create new payment record
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', authenticatedUser.id)
        .single();

      const { data, error } = await supabase
        .from('payments')
        .insert({
          organization_id: org?.id,
          invoice_id: '', // will be updated
          amount: 0, // will be updated from webhook
          currency: 'INR',
          provider: input.provider,
          provider_payment_id: input.provider_payment_id,
          status: 'processing',
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating payment:', error);
        throw error;
      }

      payment = data as Payment;
    }

    // Update payment status based on event
    const statusMap: Record<string, string> = {
      payment_captured: 'succeeded',
      payment_failed: 'failed',
      refunded: 'refunded',
    };

    const newStatus = statusMap[input.event] || input.status || 'processing';

    const { error } = await supabase
      .from('payments')
      .update({
        status: newStatus,
        paid_at: newStatus === 'succeeded' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('provider_payment_id', input.provider_payment_id);

    if (error) {
      logger.error('Error updating payment:', error);
      throw error;
    }

    // If payment succeeded, update the associated invoice
    if (newStatus === 'succeeded' && payment.invoice_id) {
      await supabase
        .from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', payment.invoice_id);
    }

    return {
      payment,
      invoice: {} as any,
      duplicate,
    };
  }

  async getPayments(filters: {
    status?: PaymentStatus;
    invoiceId?: string;
  }): Promise<Payment[]> {
    const {
      supabase,
    } = supabaseServer();

    let query = supabase.from('payments').select('*');

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.invoiceId) {
      query = query.eq('invoice_id', filters.invoiceId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching payments:', error);
      throw error;
    }

    return data as Payment[];
  }
}