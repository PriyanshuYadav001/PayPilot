import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type {
  InvoiceStatus,
} from '../../shared/types';

import {
  checkLimit,
  recordUsage,
  Metric,
} from './usageService';

/* =========================================================
   INPUT TYPES
   ========================================================= */

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

export interface InvoiceUpdateInput {
  customerId?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  discount?: number;
  status?: 'draft' | 'sent';
  notes?: string;
  termsAndConditions?: string;
}

export interface InvoiceSearchInput {
  customerId?: string;
  status?: InvoiceStatus;
  searchTerm?: string;
  page?: number;
  limit?: number;
}

/* =========================================================
   DATABASE TYPES
   ========================================================= */

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

/* =========================================================
   ERROR
   ========================================================= */

export class InvoiceError extends Error {
  code: string;
  status: number;

  constructor(
    message: string,
    code: string,
    status: number,
  ) {
    super(message);

    this.name = 'InvoiceError';
    this.code = code;
    this.status = status;

    Object.setPrototypeOf(
      this,
      InvoiceError.prototype,
    );
  }
}

/* =========================================================
   RESPONSE TYPES
   ========================================================= */

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

/* =========================================================
   HELPERS
   ========================================================= */

/**
 * Verify that a customer belongs to the current
 * organization.
 */
async function customerBelongsToOrg(
  customerId: string,
  organizationId: string,
): Promise<boolean> {
  const {
    data,
    error,
  } = await supabaseServer
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    logger.error(
      'Customer organization check failed',
      {
        error: error.message,
        customerId,
        organizationId,
      },
    );

    return false;
  }

  return Boolean(data);
}

/**
 * Calculate invoice financial values.
 */
function computeFinancials(
  items: InvoiceItemInput[],
  requestedDiscount: number,
) {
  if (!items.length) {
    throw new InvoiceError(
      'An invoice must contain at least one item.',
      'NO_INVOICE_ITEMS',
      400,
    );
  }

  let subtotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    if (!item.description?.trim()) {
      throw new InvoiceError(
        'Invoice item description is required.',
        'INVALID_ITEM_DESCRIPTION',
        400,
      );
    }

    if (!Number.isFinite(item.quantity)) {
      throw new InvoiceError(
        'Item quantity must be a valid number.',
        'INVALID_QUANTITY',
        400,
      );
    }

    if (item.quantity <= 0) {
      throw new InvoiceError(
        'Item quantity must be greater than zero.',
        'INVALID_QUANTITY',
        400,
      );
    }

    if (!Number.isFinite(item.unitPrice)) {
      throw new InvoiceError(
        'Item unit price must be a valid number.',
        'INVALID_UNIT_PRICE',
        400,
      );
    }

    if (item.unitPrice < 0) {
      throw new InvoiceError(
        'Item unit price cannot be negative.',
        'INVALID_UNIT_PRICE',
        400,
      );
    }

    if (
      item.taxRate !== undefined &&
      (
        !Number.isFinite(item.taxRate) ||
        item.taxRate < 0 ||
        item.taxRate > 100
      )
    ) {
      throw new InvoiceError(
        'Tax rate must be between 0 and 100.',
        'INVALID_TAX_RATE',
        400,
      );
    }

    const lineSubtotal =
      item.quantity * item.unitPrice;

    const lineTax =
      lineSubtotal *
      ((item.taxRate ?? 0) / 100);

    subtotal += lineSubtotal;
    taxTotal += lineTax;
  }

  const discount = Math.max(
    0,
    Number(requestedDiscount) || 0,
  );

  const grossTotal =
    subtotal + taxTotal;

  if (discount > grossTotal) {
    throw new InvoiceError(
      'Discount exceeds the invoice total.',
      'INVALID_DISCOUNT',
      400,
    );
  }

  const total =
    grossTotal - discount;

  return {
    subtotal,
    taxTotal,
    discount,
    total,
  };
}

/**
 * Resolve invoice status and payment amounts.
 */
function resolveStatus(input: {
  requestedStatus: 'draft' | 'sent';
  currentStatus: InvoiceStatus;
  amountPaid: number;
  totalAmount: number;
  dueDate: string;
}) {
  const totalAmount =
    Math.max(0, input.totalAmount);

  const amountPaid =
    Math.max(
      0,
      Math.min(
        input.amountPaid,
        totalAmount,
      ),
    );

  const amountDue =
    Math.max(
      0,
      totalAmount - amountPaid,
    );

  let status: InvoiceStatus;

  if (
    totalAmount > 0 &&
    amountDue === 0
  ) {
    status = 'paid';
  } else if (amountPaid > 0) {
    status = 'partially_paid';
  } else {
    status =
      input.requestedStatus as InvoiceStatus;
  }

  return {
    status,
    amountPaid,
    amountDue,
  };
}

/**
 * Detect PostgreSQL unique constraint violations.
 */
function isUniqueViolation(
  error: {
    code?: string;
  } | null,
): boolean {
  return error?.code === '23505';
}

/**
 * Check invoice quota without consuming usage.
 */
async function checkInvoiceUsage(
  organizationId: string,
): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const result = await checkLimit(
    organizationId,
    Metric.invoices_created,
    1,
  );

  return {
    allowed: !result.exceeded,
    remaining: result.remaining,
    limit: result.limit,
  };
}

/* =========================================================
   CREATE INVOICE
   ========================================================= */

export async function createInvoice(
  organizationId: string,
  userId: string,
  input: CreateInvoiceInput,
): Promise<Invoice> {
  /*
   * Check the invoice quota.
   *
   * IMPORTANT:
   * This only checks the limit.
   * Usage is recorded after successful creation.
   */
  const {
    allowed,
  } = await checkInvoiceUsage(
    organizationId,
  );

  if (!allowed) {
    throw new InvoiceError(
      'Plan limit reached: Your subscription does not include creating more invoices.',
      'INVOICE_LIMIT_REACHED',
      403,
    );
  }

  /*
   * Make sure the customer belongs to
   * the current organization.
   */
  const customerOk =
    await customerBelongsToOrg(
      input.customerId,
      organizationId,
    );

  if (!customerOk) {
    throw new InvoiceError(
      'Customer not found in this organization.',
      'CUSTOMER_NOT_FOUND',
      400,
    );
  }

  /*
   * Calculate financials.
   */
  const {
    subtotal,
    taxTotal,
    discount,
    total,
  } = computeFinancials(
    input.items,
    input.discount ?? 0,
  );

  /*
   * Determine initial invoice status.
   */
  const statusInput =
    input.status ?? 'draft';

  const {
    status,
    amountPaid,
    amountDue,
  } = resolveStatus({
    requestedStatus: statusInput,
    currentStatus:
      statusInput as InvoiceStatus,
    amountPaid: 0,
    totalAmount: total,
    dueDate: input.dueDate,
  });

  /*
   * Insert invoice.
   */
  const {
    data: inserted,
    error,
  } = await supabaseServer
    .from('invoices')
    .insert({
      organization_id: organizationId,
      customer_id: input.customerId,
      invoice_number:
        input.invoiceNumber,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      currency:
        input.currency ?? 'INR',
      subtotal,
      tax_total: taxTotal,
      discount,
      total_amount: total,
      amount_paid: amountPaid,
      amount_due: amountDue,
      status,
      notes:
        input.notes ?? null,
      terms_and_conditions:
        input.termsAndConditions ?? null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new InvoiceError(
        'An invoice with this number already exists.',
        'CONFLICT',
        409,
      );
    }

    logger.error(
      'createInvoice failed',
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      },
    );

    throw new InvoiceError(
      'Failed to create invoice.',
      'CREATE_INVOICE_FAILED',
      500,
    );
  }

  const invoiceId =
    inserted.id;

  /*
   * Insert invoice items.
   */
  for (const item of input.items) {
    const {
      error: itemError,
    } = await supabaseServer
      .from('invoice_items')
      .insert({
        invoice_id: invoiceId,
        description:
          item.description,
        quantity:
          item.quantity,
        unit_price:
          item.unitPrice,
        tax_rate:
          item.taxRate ?? 0,
      });

    if (itemError) {
      logger.error(
        'createInvoice: item insert failed',
        {
          message:
            itemError.message,
          invoiceId,
        },
      );

      /*
       * Try to remove the invoice if item
       * insertion failed.
       */
      await supabaseServer
        .from('invoices')
        .delete()
        .eq('id', invoiceId)
        .eq(
          'organization_id',
          organizationId,
        );

      throw new InvoiceError(
        'Failed to insert invoice items.',
        'CREATE_INVOICE_FAILED',
        500,
      );
    }
  }

  /*
   * Record invoice usage ONLY after the
   * invoice and all items were created.
   */
  const usageRecorded =
    await recordUsage(
      organizationId,
      Metric.invoices_created,
      1,
    );

  if (!usageRecorded) {
    logger.error(
      'Invoice created but usage could not be recorded',
      {
        organizationId,
        invoiceId,
      },
    );
  }

  /*
   * Fetch the complete invoice.
   */
  const {
    data: invoice,
    error: fetchError,
  } = await supabaseServer
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq(
      'organization_id',
      organizationId,
    )
    .single();

  if (fetchError) {
    logger.error(
      'Failed to fetch created invoice',
      fetchError.message,
    );

    throw new InvoiceError(
      'Failed to fetch created invoice.',
      'FETCH_INVOICE_FAILED',
      500,
    );
  }

  return invoice as Invoice;
}

/* =========================================================
   LIST INVOICES
   ========================================================= */

export async function listInvoices(
  organizationId: string,
  customerId?: string,
  status?: InvoiceStatus,
  searchTerm?: string,
  page: number = 1,
  limit: number = 50,
): Promise<InvoicePage> {
  const safePage =
    Math.max(1, page);

  const safeLimit =
    Math.min(
      100,
      Math.max(1, limit),
    );

  let query = supabaseServer
    .from('invoices')
    .select('*', {
      count: 'exact',
    })
    .eq(
      'organization_id',
      organizationId,
    );

  if (customerId) {
    query = query.eq(
      'customer_id',
      customerId,
    );
  }

  if (status) {
    query = query.eq(
      'status',
      status,
    );
  }

  if (searchTerm?.trim()) {
    query = query.ilike(
      'invoice_number',
      `%${searchTerm.trim()}%`,
    );
  }

  const {
    data: invoices,
    error,
    count,
  } = await query
    .order('created_at', {
      ascending: false,
    })
    .range(
      (safePage - 1) *
        safeLimit,
      safePage *
        safeLimit -
        1,
    );

  if (error) {
    logger.error(
      'Failed to list invoices',
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      },
    );

    throw new InvoiceError(
      'Failed to list invoices.',
      'LIST_INVOICES_FAILED',
      500,
    );
  }

  const total =
    count ?? 0;

  return {
    data:
      (invoices ?? []) as Invoice[],
    total,
    page: safePage,
    lastPage:
      Math.ceil(
        total / safeLimit,
      ),
  };
}

/* =========================================================
   GET INVOICE
   ========================================================= */

export async function getInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<Invoice | null> {
  const {
    data,
    error,
  } = await supabaseServer
    .from('invoices')
    .select('*')
    .eq(
      'organization_id',
      organizationId,
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) {
    logger.error(
      'Failed to get invoice',
      {
        message: error.message,
        invoiceId,
        organizationId,
      },
    );

    return null;
  }

  return data
    ? (data as Invoice)
    : null;
}

/* =========================================================
   UPDATE INVOICE
   ========================================================= */

export async function updateInvoice(
  organizationId: string,
  invoiceId: string,
  input: Partial<CreateInvoiceInput>,
): Promise<Invoice> {
  /*
   * First fetch the existing invoice.
   */
  const {
    data: existing,
    error: fetchError,
  } = await supabaseServer
    .from('invoices')
    .select('*')
    .eq(
      'organization_id',
      organizationId,
    )
    .eq('id', invoiceId)
    .single();

  if (fetchError || !existing) {
    logger.error(
      'Failed to fetch invoice for update',
      fetchError?.message,
    );

    throw new InvoiceError(
      'Invoice not found.',
      'INVOICE_NOT_FOUND',
      404,
    );
  }

  /*
   * Check quota.
   */
  const {
    allowed,
  } = await checkInvoiceUsage(
    organizationId,
  );

  if (!allowed) {
    throw new InvoiceError(
      'Plan limit reached: Your subscription does not include updating invoices.',
      'INVOICE_LIMIT_REACHED',
      403,
    );
  }

  const updateData: Record<
    string,
    unknown
  > = {};

  if (
    input.customerId !== undefined
  ) {
    const customerOk =
      await customerBelongsToOrg(
        input.customerId,
        organizationId,
      );

    if (!customerOk) {
      throw new InvoiceError(
        'Customer not found in this organization.',
        'CUSTOMER_NOT_FOUND',
        400,
      );
    }

    updateData.customer_id =
      input.customerId;
  }

  if (
    input.invoiceNumber !== undefined
  ) {
    updateData.invoice_number =
      input.invoiceNumber;
  }

  if (
    input.issueDate !== undefined
  ) {
    updateData.issue_date =
      input.issueDate;
  }

  if (
    input.dueDate !== undefined
  ) {
    updateData.due_date =
      input.dueDate;
  }

  if (
    input.currency !== undefined
  ) {
    updateData.currency =
      input.currency;
  }

  if (
    input.discount !== undefined
  ) {
    if (
      input.discount < 0
    ) {
      throw new InvoiceError(
        'Discount cannot be negative.',
        'INVALID_DISCOUNT',
        400,
      );
    }

    updateData.discount =
      input.discount;
  }

  if (
    input.notes !== undefined
  ) {
    updateData.notes =
      input.notes;
  }

  if (
    input.termsAndConditions !==
    undefined
  ) {
    updateData.terms_and_conditions =
      input.termsAndConditions;
  }

  if (
    input.status !== undefined
  ) {
    updateData.status =
      input.status;
  }

  /*
   * If nothing needs updating, simply return
   * the existing invoice.
   */
  if (
    Object.keys(updateData).length === 0
  ) {
    return existing as Invoice;
  }

  const {
    data,
    error,
  } = await supabaseServer
    .from('invoices')
    .update(updateData)
    .eq(
      'organization_id',
      organizationId,
    )
    .eq('id', invoiceId)
    .select('*')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new InvoiceError(
        'An invoice with this number already exists.',
        'CONFLICT',
        409,
      );
    }

    logger.error(
      'updateInvoice failed',
      {
        message: error.message,
        invoiceId,
      },
    );

    throw new InvoiceError(
      'Failed to update invoice.',
      'UPDATE_INVOICE_FAILED',
      500,
    );
  }

  /*
   * Record one update operation.
   */
  const usageRecorded =
    await recordUsage(
      organizationId,
      Metric.invoices_created,
      1,
    );

  if (!usageRecorded) {
    logger.error(
      'Invoice updated but usage could not be recorded',
      {
        organizationId,
        invoiceId,
      },
    );
  }

  return data as Invoice;
}

/* =========================================================
   DELETE INVOICE
   ========================================================= */

export async function deleteInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<void> {
  /*
   * Check that invoice exists and belongs
   * to the organization.
   */
  const {
    data: existing,
    error: fetchError,
  } = await supabaseServer
    .from('invoices')
    .select('id')
    .eq(
      'organization_id',
      organizationId,
    )
    .eq('id', invoiceId)
    .maybeSingle();

  if (fetchError) {
    logger.error(
      'Failed to check invoice before delete',
      fetchError.message,
    );

    throw new InvoiceError(
      'Failed to delete invoice.',
      'DELETE_INVOICE_FAILED',
      500,
    );
  }

  if (!existing) {
    throw new InvoiceError(
      'Invoice not found.',
      'INVOICE_NOT_FOUND',
      404,
    );
  }

  /*
   * Check usage limit.
   */
  const {
    allowed,
  } = await checkInvoiceUsage(
    organizationId,
  );

  if (!allowed) {
    throw new InvoiceError(
      'Plan limit reached: Your subscription does not include deleting invoices.',
      'INVOICE_LIMIT_REACHED',
      403,
    );
  }

  const {
    error,
  } = await supabaseServer
    .from('invoices')
    .delete()
    .eq(
      'organization_id',
      organizationId,
    )
    .eq('id', invoiceId);

  if (error) {
    logger.error(
      'deleteInvoice failed',
      {
        message: error.message,
        invoiceId,
      },
    );

    throw new InvoiceError(
      'Failed to delete invoice.',
      'DELETE_INVOICE_FAILED',
      500,
    );
  }

  /*
   * Record the operation after successful deletion.
   */
  const usageRecorded =
    await recordUsage(
      organizationId,
      Metric.invoices_created,
      1,
    );

  if (!usageRecorded) {
    logger.error(
      'Invoice deleted but usage could not be recorded',
      {
        organizationId,
        invoiceId,
      },
    );
  }
}

/* =========================================================
   INVOICE SUMMARY
   ========================================================= */

export async function getInvoiceSummary(
  organizationId: string,
): Promise<InvoiceSummary> {
  const {
    data: invoices,
    error,
    count,
  } = await supabaseServer
    .from('invoices')
    .select(
      'total_amount, amount_paid, amount_due, status',
      {
        count: 'exact',
      },
    )
    .eq(
      'organization_id',
      organizationId,
    );

  if (error) {
    logger.error(
      'Failed to get invoice summary',
      {
        message: error.message,
        organizationId,
      },
    );

    throw new InvoiceError(
      'Failed to get invoice summary.',
      'GET_INVOICE_SUMMARY_FAILED',
      500,
    );
  }

  const invoiceArray =
    (invoices ?? []) as Array<{
      total_amount: number;
      amount_paid: number;
      amount_due: number;
      status: InvoiceStatus;
    }>;

  const totalInvoices =
    count ?? invoiceArray.length;

  const totalAmount =
    invoiceArray.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.total_amount ?? 0,
        ),
      0,
    );

  const totalPaid =
    invoiceArray.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.amount_paid ?? 0,
        ),
      0,
    );

  const totalDue =
    invoiceArray.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.amount_due ?? 0,
        ),
      0,
    );

  const pendingInvoices =
    invoiceArray.filter(
      (invoice) =>
        invoice.status === 'pending' ||
        invoice.status === 'draft' ||
        invoice.status === 'sent' ||
        invoice.status === 'partially_paid',
    ).length;

  return {
    totalInvoices,
    totalAmount,
    totalPaid,
    totalDue,
    pendingInvoices,
  };
}

/* =========================================================
   SERVICE EXPORT
   ========================================================= */

export const invoiceService = {
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  listInvoices,
  getInvoiceSummary,
};