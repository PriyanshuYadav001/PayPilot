import { supabaseServer } from '../../lib/supabaseClient';
import { invoiceService } from '../invoiceService';
import { logger } from '../../utils/logger';
import { toJson } from '../../utils/json';
import { getPaymentProvider, PaymentError } from './index';
import type { IPaymentProvider, WebhookVerificationResult } from './PaymentProvider';
import type { Invoice, Payment, PaymentLink, PaymentLinkStatus, PaymentStatus } from '../../../shared/types';

export interface PaymentLinkCreateInput {
  invoiceId: string;
  amount?: number;
  expiresInDays?: number;
}

export interface PaymentCreateInput {
  invoiceId: string;
  amount?: number;
  idempotencyKey?: string;
}

export interface PaymentCreateResult {
  payment: Payment;
  providerOrderId: string;
  amountPaise: number;
  keyId?: string;
}

export interface WebhookHandlingResult {
  handled: boolean;
  event: string;
  applied: boolean;
  duplicate?: boolean;
}

export interface PaymentListItem extends Payment {
  invoiceNumber: string;
  customerName: string;
}

export interface PaymentListParams {
  page: number;
  limit: number;
  status?: string;
  sortBy: 'paid_at' | 'amount' | 'status' | 'created_at';
  sortOrder: 'asc' | 'desc';
}

export interface PaymentListResult {
  payments: PaymentListItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type PublicPaymentStatus = 'open' | 'partially_paid' | 'paid' | 'expired' | 'cancelled';

export interface PublicPaymentPage {
  token: string;
  businessName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  payableAmount: number;
  invoiceStatus: string;
  paymentStatus: PublicPaymentStatus;
  paymentLinkUrl: string | null;
  customerName?: string;
  customerEmail?: string;
  providerConfigured: boolean;
}

export interface PublicCheckout {
  keyId?: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  businessName: string;
  prefill?: { name?: string; email?: string };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

function normalizeProviderName(provider: string): string {
  return provider.toLowerCase();
}

function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    invoiceId: row.invoice_id as string,
    paymentLinkId: (row.payment_link_id as string | null) ?? undefined,
    amount: Number(row.amount),
    currency: (row.currency as string) ?? 'INR',
    method: (row.method as Payment['method']) ?? 'upi',
    status: row.status as PaymentStatus,
    provider: row.provider as string,
    providerPaymentId: (row.provider_payment_id as string | null) ?? undefined,
    providerOrderId: (row.provider_order_id as string | null) ?? undefined,
    referenceNumber: (row.reference_number as string | null) ?? undefined,
    paidAt: (row.paid_at as string) ?? (row.created_at as string),
    notes: (row.notes as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function mapPaymentLink(row: Record<string, unknown>): PaymentLink {
  const invoice = row.invoice as Record<string, unknown> | undefined;
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    invoiceId: row.invoice_id as string,
    provider: row.provider as string,
    providerLinkId: row.provider_link_id as string,
    shortUrl: row.short_url as string,
    qrCodeUrl: (row.qr_code_url as string | null) ?? undefined,
    amount: Number(row.amount),
    currency: (row.currency as string) ?? 'INR',
    status: row.status as PaymentLinkStatus,
    expiresAt: (row.expires_at as string | null) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    invoiceNumber: invoice?.invoice_number as string | undefined,
  };
}

async function providerOrThrow(providerName?: string): Promise<IPaymentProvider> {
  const provider = getPaymentProvider(normalizeProviderName(providerName ?? 'razorpay'));
  if (!provider.isConfigured) {
    throw new PaymentError(
      'Payment provider credentials are not configured. Payments are not being processed.',
      'PAYMENT_PROVIDER_NOT_CONFIGURED',
      503
    );
  }
  return provider;
}

async function getCollectableInvoice(organizationId: string, invoiceId: string): Promise<Invoice> {
  const invoice = await invoiceService.getInvoice(organizationId, invoiceId);
  if (!invoice) {
    throw new PaymentError('Invoice not found.', 'INVOICE_NOT_FOUND', 404);
  }
  if (invoice.status === 'cancelled') {
    throw new PaymentError('Payments cannot be collected on a cancelled invoice.', 'INVOICE_CANCELLED', 409);
  }
  if (invoice.status === 'paid' || invoice.amountDue <= 0) {
    throw new PaymentError('This invoice has already been paid in full.', 'INVOICE_ALREADY_PAID', 409);
  }
  return invoice;
}

function resolveAmount(inputAmount: number | undefined, amountDue: number): number {
  const amount = round2(inputAmount ?? amountDue);
  if (amount <= 0) {
    throw new PaymentError('Payment amount must be greater than zero.', 'INVALID_AMOUNT', 400);
  }
  if (amount > amountDue) {
    throw new PaymentError(
      `Payment amount exceeds the invoice balance of ${amountDue}.`,
      'AMOUNT_EXCEEDS_BALANCE',
      400
    );
  }
  return amount;
}

export async function createPaymentLink(
  organizationId: string,
  input: PaymentLinkCreateInput
): Promise<PaymentLink> {
  const invoice = await getCollectableInvoice(organizationId, input.invoiceId);
  const amount = resolveAmount(input.amount, invoice.amountDue);
  const expiresInDays = input.expiresInDays ?? 7;
  const expiryDate = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const provider = await providerOrThrow();

  const response = await provider.createPaymentLink({
    organizationId,
    invoiceId: invoice.id,
    amountPaise: Math.round(amount * 100),
    currency: invoice.currency,
    customerName: invoice.customer?.companyName ?? invoice.customer?.contactName ?? 'Customer',
    customerEmail: invoice.customer?.email ?? '',
    customerPhone: invoice.customer?.phone,
    description: `Payment for invoice ${invoice.invoiceNumber}`,
    dueDate: new Date(invoice.dueDate),
    expiryDate,
    callbackUrl: process.env.APP_URL,
  });

  const { data, error } = await supabaseServer
    .from('payment_links')
    .insert({
      organization_id: organizationId,
      invoice_id: invoice.id,
      provider: provider.name,
      provider_link_id: response.providerLinkId,
      short_url: response.shortUrl,
      qr_code_url: response.qrCodeUrl ?? undefined,
      amount,
      currency: invoice.currency,
      status: 'active',
      expires_at: expiryDate.toISOString(),
      metadata: toJson(response.rawResponse),
    })
    .select()
    .single();

  if (error) {
    logger.error('createPaymentLink insert failed', error.message);
    throw new PaymentError('Failed to store payment link.', 'PAYMENT_LINK_CREATE_FAILED', 500);
  }

  return mapPaymentLink(data as Record<string, unknown>);
}

export async function getPaymentLink(organizationId: string, linkId: string): Promise<PaymentLink | null> {
  const { data, error } = await supabaseServer
    .from('payment_links')
    .select('*, invoice:invoices(invoice_number)')
    .eq('organization_id', organizationId)
    .eq('id', linkId)
    .maybeSingle();

  if (error) {
    logger.error('getPaymentLink failed', error.message);
    throw new PaymentError('Failed to load payment link.', 'PAYMENT_LINK_READ_FAILED', 500);
  }

  if (!data) {
    return null;
  }

  const link = mapPaymentLink(data as Record<string, unknown>);
  if (
    link.status === 'active' &&
    link.expiresAt &&
    new Date(link.expiresAt).getTime() < Date.now()
  ) {
    return { ...link, status: 'expired' };
  }
  return link;
}

export async function createPayment(
  organizationId: string,
  input: PaymentCreateInput
): Promise<PaymentCreateResult> {
  const invoice = await getCollectableInvoice(organizationId, input.invoiceId);
  const amount = resolveAmount(input.amount, invoice.amountDue);
  const idempotencyKey = input.idempotencyKey;

  if (idempotencyKey) {
    const { data: existing } = await supabaseServer
      .from('payments')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return {
        payment: mapPayment(existing as Record<string, unknown>),
        providerOrderId: (existing.provider_order_id as string) ?? '',
        amountPaise: Math.round(Number(existing.amount) * 100),
        keyId: undefined,
      };
    }
  }

  const provider = await providerOrThrow();

  const order = await provider.createPaymentOrder({
    organizationId,
    invoiceId: invoice.id,
    amountPaise: Math.round(amount * 100),
    currency: invoice.currency,
    receipt: invoice.invoiceNumber,
    notes: {
      invoice_number: invoice.invoiceNumber,
    },
  });

  const { data, error } = await supabaseServer
    .from('payments')
    .insert({
      organization_id: organizationId,
      invoice_id: invoice.id,
      amount,
      currency: invoice.currency,
      status: 'pending',
      provider: provider.name,
      provider_order_id: order.providerOrderId,
      idempotency_key: idempotencyKey ?? undefined,
      raw_payload: toJson(order.rawResponse),
    })
    .select()
    .single();

  if (error) {
    // A concurrent request won the race with the same idempotency key (or the
    // provider order was already recorded): return the existing payment row.
    if (isUniqueViolation(error) && idempotencyKey) {
      const { data: existing } = await supabaseServer
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing) {
        return {
          payment: mapPayment(existing as Record<string, unknown>),
          providerOrderId: (existing.provider_order_id as string) ?? '',
          amountPaise: Math.round(Number(existing.amount) * 100),
          keyId: undefined,
        };
      }
    }
    logger.error('createPayment insert failed', error.message);
    throw new PaymentError('Failed to create payment order.', 'PAYMENT_CREATE_FAILED', 500);
  }

  return {
    payment: mapPayment(data as Record<string, unknown>),
    providerOrderId: order.providerOrderId,
    amountPaise: Math.round(amount * 100),
    keyId: provider.keyId,
  };
}

export async function getInvoicePayments(organizationId: string, invoiceId: string): Promise<Payment[]> {
  const invoice = await invoiceService.getInvoice(organizationId, invoiceId);
  if (!invoice) {
    throw new PaymentError('Invoice not found.', 'INVOICE_NOT_FOUND', 404);
  }

  const { data, error } = await supabaseServer
    .from('payments')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('getInvoicePayments failed', error.message);
    throw new PaymentError('Failed to load payments.', 'PAYMENT_LIST_FAILED', 500);
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapPayment);
}

export async function listPayments(
  organizationId: string,
  params: PaymentListParams,
): Promise<PaymentListResult> {
  const from = (params.page - 1) * params.limit;
  const to = from + params.limit - 1;
  let query = supabaseServer
    .from('payments')
    .select('*, invoice:invoices(invoice_number, customer:customers(company_name, contact_name))', { count: 'exact' })
    .eq('organization_id', organizationId)
    .order(params.sortBy, { ascending: params.sortOrder === 'asc' })
    .range(from, to);

  if (params.status) query = query.eq('status', params.status as 'captured' | 'pending' | 'processing' | 'successful' | 'failed' | 'refunded' | 'cancelled');

  const { data, error, count } = await query;
  if (error) {
    logger.error('listPayments failed', error.message);
    throw new PaymentError('Failed to load payments.', 'PAYMENT_LIST_FAILED', 500);
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const totalCount = count ?? rows.length;
  const payments = rows.map((row) => {
    const invoice = row.invoice as Record<string, unknown> | undefined;
    const customer = invoice?.customer as Record<string, unknown> | undefined;
    return {
      ...mapPayment(row),
      invoiceNumber: (invoice?.invoice_number as string) ?? '',
      customerName: (customer?.company_name as string) ?? (customer?.contact_name as string) ?? '',
    };
  });

  return {
    payments,
    totalCount,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(totalCount / params.limit),
  };
}

async function findPaymentByProvider(
  orderId?: string,
  paymentId?: string
): Promise<Record<string, unknown> | null> {
  if (orderId) {
    const { data, error } = await supabaseServer
      .from('payments')
      .select('*')
      .eq('provider_order_id', orderId)
      .maybeSingle();
    if (!error && data) return data as Record<string, unknown>;
  }
  if (paymentId) {
    const { data, error } = await supabaseServer
      .from('payments')
      .select('*')
      .eq('provider_payment_id', paymentId)
      .maybeSingle();
    if (!error && data) return data as Record<string, unknown>;
  }
  return null;
}

/**
 * Stable deduplication key for a webhook event. Prefers the provider's own
 * event id (Razorpay sends `event_id`); falls back to a derived key so events
 * without an id remain idempotent.
 */
function eventKeyFor(result: WebhookVerificationResult, providerName: string): string {
  if (result.eventId) return result.eventId;
  const subject = result.orderId ?? result.paymentId ?? result.paymentLinkId ?? 'unknown';
  return `${providerName}:${result.event}:${subject}`;
}

async function recordWebhookEvent(
  providerName: string,
  event: string,
  eventKey: string,
  organizationId: string | undefined,
  rawPayload: Record<string, unknown>,
  errorMessage?: string
): Promise<'created' | 'duplicate'> {
  const { error } = await supabaseServer.from('webhook_events').insert({
    provider: providerName as 'razorpay',
    event_type: event,
    provider_event_id: eventKey,
    organization_id: organizationId ?? undefined,
    payload: toJson(rawPayload),
    is_processed: true,
    processed_at: new Date().toISOString(),
    ...(errorMessage ? { error_message: errorMessage } : {}),
  });
  if (error) {
    if (isUniqueViolation(error)) return 'duplicate';
    logger.error('recordWebhookEvent: insert failed', error.message);
    throw new PaymentError('Failed to record webhook event.', 'WEBHOOK_EVENT_RECORD_FAILED', 500);
  }
  return 'created';
}

async function runWebhookRpc(
  name: string,
  args: Record<string, unknown>
): Promise<{ result?: string; error?: string }> {
  const { data, error } = await supabaseServer.rpc(name, args);
  if (error) {
    logger.error(`webhook rpc ${name} failed`, error.message);
    return { error: error.message };
  }
  return { result: typeof data === 'string' ? data : undefined };
}

interface PublicLinkBundle {
  link: Record<string, unknown>;
  invoice: Record<string, unknown>;
  organization: Record<string, unknown>;
  customer: Record<string, unknown> | null;
}

async function loadPublicLink(token: string): Promise<PublicLinkBundle | null> {
  const { data: link, error } = await supabaseServer
    .from('payment_links')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();

  if (error) {
    logger.error('loadPublicLink failed', error.message);
    throw new PaymentError('Failed to load payment details.', 'PAYMENT_PAGE_LOAD_FAILED', 500);
  }
  if (!link) return null;

  const invoiceId = link.invoice_id as string;
  const { data: invoice, error: invoiceError } = await supabaseServer
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (invoiceError) {
    logger.error('loadPublicLink invoice lookup failed', invoiceError.message);
    throw new PaymentError('Failed to load payment details.', 'PAYMENT_PAGE_LOAD_FAILED', 500);
  }
  if (!invoice) return null;

  const organizationId = invoice.organization_id as string;
  const { data: organization, error: orgError } = await supabaseServer
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle();
  if (orgError) {
    logger.error('loadPublicLink organization lookup failed', orgError.message);
    throw new PaymentError('Failed to load payment details.', 'PAYMENT_PAGE_LOAD_FAILED', 500);
  }
  if (!organization) return null;

  const customerId = invoice.customer_id as string;
  const { data: customer, error: customerError } = await supabaseServer
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();
  if (customerError) {
    logger.error('loadPublicLink customer lookup failed', customerError.message);
    throw new PaymentError('Failed to load payment details.', 'PAYMENT_PAGE_LOAD_FAILED', 500);
  }

  return { link, invoice, organization, customer: customer as Record<string, unknown> | null };
}

function publicLinkEffectiveStatus(
  link: Record<string, unknown>,
  invoice: Record<string, unknown>
): PublicPaymentStatus {
  const linkStatus = link.status as string;
  const invoiceStatus = invoice.status as string;
  const amountPaid = Number(invoice.amount_paid ?? 0);
  const amountDue = Number(invoice.amount_due ?? 0);

  if (invoiceStatus === 'paid' || amountDue <= 0) return 'paid';
  if (linkStatus === 'expired') return 'expired';
  if (linkStatus === 'cancelled') return 'cancelled';
  if (
    linkStatus === 'active' &&
    link.expires_at &&
    new Date(link.expires_at as string).getTime() < Date.now()
  ) {
    return 'expired';
  }
  if (linkStatus !== 'active') return 'cancelled';
  if (amountPaid > 0) return 'partially_paid';
  return 'open';
}

function resolvePublicPayable(link: Record<string, unknown>, invoice: Record<string, unknown>): number {
  const amountDue = round2(Number(invoice.amount_due ?? 0));
  const linkAmount = link.amount != null ? round2(Number(link.amount)) : amountDue;
  return round2(Math.min(linkAmount, amountDue));
}

export async function getPublicPaymentPage(token: string): Promise<PublicPaymentPage | null> {
  const bundle = await loadPublicLink(token);
  if (!bundle) return null;

  const { link, invoice, organization, customer } = bundle;
  const provider = getPaymentProvider('razorpay');

  return {
    token,
    businessName: (organization.name as string) ?? 'Business',
    invoiceNumber: invoice.invoice_number as string,
    issueDate: invoice.issue_date as string,
    dueDate: invoice.due_date as string,
    currency: (invoice.currency as string) ?? 'INR',
    totalAmount: Number(invoice.total_amount),
    amountPaid: Number(invoice.amount_paid ?? 0),
    amountDue: Number(invoice.amount_due ?? 0),
    payableAmount: resolvePublicPayable(link, invoice),
    invoiceStatus: invoice.status as string,
    paymentStatus: publicLinkEffectiveStatus(link, invoice),
    paymentLinkUrl: (link.short_url as string | null) ?? null,
    customerName: (customer?.contact_name as string | undefined) ?? undefined,
    customerEmail: (customer?.email as string | undefined) ?? undefined,
    providerConfigured: provider.isConfigured,
  };
}

export async function createPublicCheckout(token: string): Promise<PublicCheckout> {
  const bundle = await loadPublicLink(token);
  if (!bundle) {
    throw new PaymentError('Payment link not found or no longer available.', 'PAYMENT_LINK_NOT_FOUND', 404);
  }

  const { link, invoice, organization, customer } = bundle;
  const status = publicLinkEffectiveStatus(link, invoice);
  if (status === 'paid') {
    throw new PaymentError('This invoice has already been paid in full.', 'INVOICE_ALREADY_PAID', 409);
  }
  if (status === 'expired') {
    throw new PaymentError('This payment link has expired.', 'PAYMENT_LINK_EXPIRED', 409);
  }
  if (status === 'cancelled') {
    throw new PaymentError('This payment link is no longer active.', 'PAYMENT_LINK_NOT_ACTIVE', 409);
  }

  const payable = resolvePublicPayable(link, invoice);
  if (payable <= 0) {
    throw new PaymentError('This invoice has already been paid in full.', 'INVOICE_ALREADY_PAID', 409);
  }

  const provider = await providerOrThrow();
  const invoiceId = invoice.id as string;
  const organizationId = invoice.organization_id as string;
  const linkId = link.id as string;
  const currency = (invoice.currency as string) ?? 'INR';

  // Reuse an in-flight (pending) payment for this link so refreshing the page
  // does not spawn duplicate provider orders.
  const { data: existing, error: existingError } = await supabaseServer
    .from('payments')
    .select('*')
    .eq('payment_link_id', linkId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingError) {
    logger.error('createPublicCheckout pending lookup failed', existingError.message);
    throw new PaymentError('Failed to start payment.', 'PAYMENT_CREATE_FAILED', 500);
  }

  let orderId = existing?.provider_order_id as string | undefined;
  let amountPaise = existing ? Math.round(Number(existing.amount) * 100) : Math.round(payable * 100);

  if (!existing) {
    const order = await provider.createPaymentOrder({
      organizationId,
      invoiceId,
      amountPaise,
      currency,
      receipt: invoice.invoice_number as string,
      notes: { invoice_number: invoice.invoice_number as string },
    });
    orderId = order.providerOrderId;
    amountPaise = Math.round(payable * 100);

    const { error: insertError } = await supabaseServer
      .from('payments')
      .insert({
        organization_id: organizationId,
        invoice_id: invoiceId,
        payment_link_id: linkId,
        amount: payable,
        currency,
        status: 'pending',
        provider: provider.name,
        provider_order_id: order.providerOrderId,
        raw_payload: toJson(order.rawResponse),
      });

    if (insertError) {
      // A concurrent checkout won the race with the same provider order: reuse it.
      if (isUniqueViolation(insertError)) {
        const { data: raced } = await supabaseServer
          .from('payments')
          .select('*')
          .eq('payment_link_id', linkId)
          .eq('status', 'pending')
          .maybeSingle();
        if (raced) {
          orderId = raced.provider_order_id as string;
          amountPaise = Math.round(Number(raced.amount) * 100);
        }
      } else {
        logger.error('createPublicCheckout insert failed', insertError.message);
        throw new PaymentError('Failed to start payment.', 'PAYMENT_CREATE_FAILED', 500);
      }
    }
  }

  if (!orderId) {
    throw new PaymentError('Failed to start payment.', 'PAYMENT_CREATE_FAILED', 500);
  }

  logger.info('Public checkout created', { invoiceNumber: invoice.invoice_number as string, amountPaise });

  return {
    keyId: provider.keyId,
    orderId,
    amountPaise,
    currency,
    businessName: (organization.name as string) ?? 'Business',
    prefill: {
      name: (customer?.contact_name as string | undefined) ?? undefined,
      email: (customer?.email as string | undefined) ?? undefined,
    },
  };
}

export async function handlePaymentWebhook(
  rawBody: string | Buffer,
  signature: string,
  providerName: string
): Promise<WebhookHandlingResult> {
  const provider = await providerOrThrow(providerName);

  const result = await provider.verifyWebhookSignature(rawBody, signature);
  if (!result.isValid) {
    throw new PaymentError('Invalid payment webhook signature.', 'INVALID_WEBHOOK_SIGNATURE', 401);
  }

  const eventKey = eventKeyFor(result, providerName);
  logger.info('Payment webhook received', { provider: providerName, event: result.event, eventId: result.eventId });

  if (result.event === 'unknown') {
    await recordWebhookEvent(providerName, result.event, eventKey, undefined, result.rawPayload);
    return { handled: true, event: result.event, applied: false };
  }

  const payment = await findPaymentByProvider(result.orderId, result.paymentId);
  if (!payment) {
    logger.warn('Payment webhook has no matching payment', {
      provider: providerName,
      event: result.event,
      orderId: result.orderId,
      paymentId: result.paymentId,
    });
    await recordWebhookEvent(providerName, result.event, eventKey, undefined, result.rawPayload, 'No matching payment found.');
    return { handled: true, event: result.event, applied: false };
  }

  const organizationId = payment.organization_id as string;
  const paymentId = payment.id as string;

  let rpcName: string;
  let rpcArgs: Record<string, unknown>;
  const appliedStatuses = new Set<string>();

  switch (result.event) {
    case 'payment.initiated': {
      rpcName = 'mark_payment_processing';
      rpcArgs = { p_payment_id: paymentId, p_raw_payload: result.rawPayload };
      appliedStatuses.add('processing');
      break;
    }
    case 'payment.captured':
    case 'payment_link.paid': {
      rpcName = 'confirm_payment_capture';
      rpcArgs = {
        p_payment_id: paymentId,
        p_provider_payment_id: result.paymentId ?? null,
        p_method: (result.method as Payment['method']) ?? null,
        p_paid_at: new Date().toISOString(),
        p_raw_payload: result.rawPayload,
      };
      appliedStatuses.add('confirmed').add('confirmed_no_amount');
      break;
    }
    case 'payment.failed': {
      rpcName = 'mark_payment_failed';
      rpcArgs = {
        p_payment_id: paymentId,
        p_provider_payment_id: result.paymentId ?? null,
        p_raw_payload: result.rawPayload,
      };
      appliedStatuses.add('failed');
      break;
    }
    case 'payment.refunded': {
      rpcName = 'mark_payment_refunded';
      rpcArgs = { p_payment_id: paymentId, p_raw_payload: result.rawPayload };
      appliedStatuses.add('refunded');
      break;
    }
    default:
      await recordWebhookEvent(providerName, result.event, eventKey, organizationId, result.rawPayload);
      return { handled: true, event: result.event, applied: false };
  }

  const { result: rpcResult, error: rpcError } = await runWebhookRpc(rpcName, rpcArgs);

  // A failed RPC (transient DB error) leaves no audit record, so the provider's
  // retry re-runs the idempotent RPC instead of being swallowed as a duplicate.
  if (rpcError) {
    logger.error('Payment webhook processing failed', { provider: providerName, event: result.event, rpcName, error: rpcError });
    return { handled: true, event: result.event, applied: false };
  }

  const duplicate = rpcResult === 'duplicate';
  await recordWebhookEvent(providerName, result.event, eventKey, organizationId, result.rawPayload);

  logger.info('Payment webhook processed', {
    provider: providerName,
    event: result.event,
    eventId: result.eventId,
    rpcResult,
    paymentId,
    duplicate,
  });

  return { handled: true, event: result.event, applied: !duplicate && (rpcResult ? appliedStatuses.has(rpcResult) : false), duplicate };
}

export const paymentService = {
  createPaymentLink,
  getPaymentLink,
  createPayment,
  getInvoicePayments,
  listPayments,
  getPublicPaymentPage,
  createPublicCheckout,
  handlePaymentWebhook,
};

export { PaymentError } from './index';
