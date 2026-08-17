import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type { Customer, InvoiceItem, InvoiceStatus } from '../../shared/types';
import { checkAndRecordUsage, Metric } from './usageService';

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface InvoiceCreateInput {
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency?: string;
  discount?: number;
  items: InvoiceItemInput[];
  status?: 'draft' | 'sent';
  notes?: string;
  termsAndConditions?: string;
}

export interface InvoiceUpdateInput {
  customerId?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
}

export interface InvoiceSearchInput {
  customerId?: string;
  status?: InvoiceStatus;
  searchTerm?: string;
  page?: number;
  limit?: number;
}

export interface Invoice {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: InvoiceStatus;
  notes?: string;
  terms_and_conditions?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceError {
  message: string;
  code: string;
  status: number;
}

export interface InvoicePage {
  data: Invoice[];
  total: number;
  page: number;
  lastPage: number;
}

export interface InvoiceSummary {
  totalInvoices: number;
  totalAmount: number;
  totalPaid: number;
  totalDue: number;
  pendingInvoices: number;
}

/**
 * Check if the organization has remaining invoice quota before creating an invoice.
 */
function canCreateInvoice(organizationId: string): { allowed: boolean; remaining: number; limit: number } {
  return checkAndRecordUsage(organizationId, Metric.invoices_created, 1);
}

// Check if the organization has remaining invoice quota before creating an invoice
async function checkInvoiceUsage(organizationId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const { allowed } = await checkAndRecordUsage(organizationId, Metric.invoices_created, 1);
  return { allowed };
}

export interface CreateInvoiceInput {
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency?: string;
  discount?: number;
  items: InvoiceItemInput[];
  status?: 'draft' | 'sent';
  notes?: string;
  termsAndConditions?: string;
}

export async function createInvoice(
  organizationId: string,
  userId: string,
  input: CreateInvoiceInput
): Promise<Invoice> {
  // Check invoice creation usage limit before creating
  const { allowed } = await checkInvoiceUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include creating invoices.');
  }

  const customerOk = await customerBelongsToOrg(input.customerId, organizationId);
  if (!customerOk) {
    throw new InvoiceError('Customer not found in this organization.', 'CUSTOMER_NOT_FOUND', 400);
  }

  const { subtotal, taxTotal, discount, total } = computeFinancials(input.items, input.discount ?? 0);
  if (total < 0) {
    throw new InvoiceError('Discount exceeds the invoice total.', 'INVALID_DISCOUNT', 400);
  }

  const statusInput = input.status ?? 'draft';
  const { status, amountPaid, amountDue } = resolveStatus({
    requestedStatus: statusInput,
    currentStatus: statusInput,
    amountPaid: 0,
    totalAmount: total,
    dueDate: input.dueDate,
  });

  const { data: inserted, error } = await supabaseServer
    .from('invoices')
    .insert({
      organization_id: organizationId,
      customer_id: input.customerId,
      invoice_number: input.invoiceNumber,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      currency: input.currency ?? 'INR',
      subtotal,
      tax_total: taxTotal,
      discount,
      total_amount: total,
      amount_paid: amountPaid,
      amount_due: amountDue,
      status,
      notes: input.notes ?? null,
      terms_and_conditions: input.termsAndConditions ?? null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new InvoiceError('An invoice with this number already exists.', 'CONFLICT', 409);
    }

    logger.error('createInvoice failed', error.message);
    throw new InvoiceError('Failed to create invoice.', 'CREATE_INVOICE_FAILED', 500);
  }

  const invoiceId = inserted.id;

  // Insert invoice items
  for (const item of input.items) {
    const { error: itemsError } = await supabaseServer
      .from('invoice_items')
      .insert({
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tax_rate: item.taxRate,
      });

    if (itemsError) {
      logger.error('createInvoice: item insert failed', itemsError.message);
      throw new InvoiceError('Failed to insert invoice items.', 'CREATE_INVOICE_FAILED', 500);
    }
  }

  // Record usage after successful invoice creation
  await recordUsage(organizationId, Metric.invoices_created, 1);

  // Return the created invoice
  const { data: invoice, error: fetchError } = await supabaseServer
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (fetchError) {
    logger.error('Failed to fetch created invoice', fetchError.message);
    throw new InvoiceError('Failed to fetch created invoice.', 'FETCH_INVOICE_FAILED', 500);
  }

  return invoice as Invoice;
}

export async function listInvoices(
  organizationId: string,
  customerId?: string,
  status?: InvoiceStatus,
  searchTerm?: string,
  page: number = 1,
  limit: number = 50,
): Promise<InvoicePage> {
  let query = supabaseServer
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId);

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (searchTerm?.trim()) {
    query = query.ilike('invoice_number', `%${searchTerm.trim()}%`);
  }

  const { data: invoices, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    logger.error('Failed to list invoices', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new InvoiceError('Failed to list invoices.', 'LIST_INVOICES_FAILED', 500);
  }

  const total = count ?? 0;

  return {
    data: invoices as Invoice[],
    total,
    page,
    lastPage: Math.ceil(total / limit),
  };
}

export async function getInvoice(organizationId: string, invoiceId: string): Promise<Invoice | null> {
  const { data, error } = await supabaseServer
    .from('invoices')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', invoiceId)
    .single();

  if (error) {
    logger.error('Failed to get invoice', error.message);
    return null;
  }

  return data as Invoice;
}

export async function updateInvoice(
  organizationId: string,
  invoiceId: string,
  input: Partial<CreateInvoiceInput>
): Promise<Invoice> {
  const { data: existing, error: fetchError } = await supabaseServer
    .from('invoices')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', invoiceId)
    .single();

  if (fetchError) {
    logger.error('Failed to fetch invoice for update', fetchError.message);
    throw new InvoiceError('Invoice not found.', 'INVOICE_NOT_FOUND', 404);
  }

  // Check invoice update usage limit
  const { allowed } = await checkInvoiceUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include updating invoices.');
  }

  const updateData: Record<string, unknown> = {};

  if (input.customerId !== undefined) {
    updateData.customer_id = input.customerId;
  }
  if (input.invoiceNumber !== undefined) {
    updateData.invoice_number = input.invoiceNumber;
  }
  if (input.issueDate !== undefined) {
    updateData.issue_date = input.issueDate;
  }
  if (input.dueDate !== undefined) {
    updateData.due_date = input.dueDate;
  }
  if (input.currency !== undefined) {
    updateData.currency = input.currency;
  }
  if (input.discount !== undefined) {
    updateData.discount = input.discount;
  }
  if (input.notes !== undefined) {
    updateData.notes = input.notes;
  }
  if (input.termsAndConditions !== undefined) {
    updateData.terms_and_conditions = input.termsAndConditions;
  }
  if (input.status !== undefined) {
    updateData.status = input.status;
  }

  const { data, error } = await supabaseServer
    .from('invoices')
    .update(updateData)
    .eq('organization_id', organizationId)
    .eq('id', invoiceId)
    .select('*')
    .single();

  if (error) {
    logger.error('updateInvoice failed', error.message);
    throw new InvoiceError('Failed to update invoice.', 'UPDATE_INVOICE_FAILED', 500);
  }

  return data as Invoice;
}

export async function deleteInvoice(
  organizationId: string,
  invoiceId: string
): Promise<void> {
  // Check invoice delete usage limit
  const { allowed } = await checkInvoiceUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include deleting invoices.');
  }

  const { error } = await supabaseServer
    .from('invoices')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', invoiceId);

  if (error) {
    logger.error('deleteInvoice failed', error.message);
    throw new InvoiceError('Failed to delete invoice.', 'DELETE_INVOICE_FAILED', 500);
  }
}

/**
 * Get invoice summary statistics for an organization.
 */
export async function getInvoiceSummary(organizationId: string): Promise<InvoiceSummary> {
  const { data: invoices, error, count } = await supabaseServer
    .from('invoices')
    .select('total_amount, amount_paid, status', { count: 'exact' })
    .eq('organization_id', organizationId);

  if (error) {
    logger.error('Failed to get invoice summary', error.message);
    throw new InvoiceError('Failed to get invoice summary.', 'GET_INVOICE_SUMMARY_FAILED', 500);
  }

  const totalInvoices = count || 0;

  // Use the already-fetched data for aggregates instead of a second query
  const invoiceArray = invoices as Invoice[];
  const totalAmount = invoiceArray.reduce((sum, invoice) => sum + (invoice as any).total_amount, 0);
  const totalPaid = invoiceArray.reduce((sum, invoice) => sum + (invoice as any).amount_paid, 0);
  const totalDue = totalAmount - totalPaid;
  const pendingInvoices = invoiceArray.filter(
    (invoice: any) => invoice.status === 'pending' || invoice.status === 'draft'
  ).length;

  return {
    totalInvoices,
    totalAmount,
    totalPaid,
    totalDue,
    pendingInvoices,
  };
}

// Named exports for external consumption
export const invoiceService = {
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  listInvoices,
  getInvoiceSummary,
};
