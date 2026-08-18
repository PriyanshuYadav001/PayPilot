import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type {
  Invoice,
  InvoiceItem,
  Customer,
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
  items?: InvoiceItemInput[];
  status?: InvoiceStatus;
  amountPaid?: number;
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
   ERROR
   ========================================================= */

export class InvoiceError extends Error {
  code: string;
  status: number;
  statusCode: number;

  constructor(
    message: string,
    code: string,
    status: number,
  ) {
    super(message);

    this.name = 'InvoiceError';
    this.code = code;
    this.status = status;
    this.statusCode = status;

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
  limit: number;
  totalPage: number;
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

function roundMoney(value: number): number {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}

/**
 * Calculate one invoice item's financial values.
 */
function calculateItemFinancials(
  item: InvoiceItemInput,
): {
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
} {
  const quantity = Number(item.quantity);
  const unitPrice = roundMoney(
    Number(item.unitPrice),
  );
  const taxRate = Number(item.taxRate ?? 0);

  const subtotal = roundMoney(
    quantity * unitPrice,
  );

  const taxAmount = roundMoney(
    subtotal * (taxRate / 100),
  );

  const total = roundMoney(
    subtotal + taxAmount,
  );

  return {
    quantity,
    unitPrice,
    taxRate,
    subtotal,
    taxAmount,
    total,
  };
}

/**
 * Convert a Supabase invoice row from snake_case
 * into the application's camelCase Invoice shape.
 */
function mapInvoiceRow(row: any): Invoice {
  if (!row) {
    return row;
  }

  const mapped: any = {
    ...row,

    id: row.id,

    organizationId:
      row.organizationId ??
      row.organization_id,

    customerId:
      row.customerId ??
      row.customer_id,

    invoiceNumber:
      row.invoiceNumber ??
      row.invoice_number,

    issueDate:
      row.issueDate ??
      row.issue_date,

    dueDate:
      row.dueDate ??
      row.due_date,

    currency:
      row.currency,

    subtotal:
      row.subtotal !== undefined
        ? Number(row.subtotal)
        : undefined,

    taxTotal:
      row.taxTotal !== undefined
        ? Number(row.taxTotal)
        : Number(row.tax_total ?? 0),

    discount:
      row.discount !== undefined
        ? Number(row.discount)
        : 0,

    totalAmount:
      row.totalAmount !== undefined
        ? Number(row.totalAmount)
        : Number(row.total_amount ?? 0),

    amountPaid:
      row.amountPaid !== undefined
        ? Number(row.amountPaid)
        : Number(row.amount_paid ?? 0),

    amountDue:
      row.amountDue !== undefined
        ? Number(row.amountDue)
        : Number(row.amount_due ?? 0),

    status:
      row.status,

    notes:
      row.notes,

    termsAndConditions:
      row.termsAndConditions ??
      row.terms_and_conditions,

    createdAt:
      row.createdAt ??
      row.created_at,

    updatedAt:
      row.updatedAt ??
      row.updated_at,

    createdBy:
      row.createdBy ??
      row.created_by,
  };

  if (row.customer) {
    mapped.customer =
      mapCustomerRow(row.customer);
  }

  if (row.items) {
    mapped.items =
      row.items.map(mapInvoiceItemRow);
  }

  return mapped as Invoice;
}

function mapCustomerRow(row: any): Customer {
  if (!row) {
    return row;
  }

  return {
    ...row,

    organizationId:
      row.organizationId ??
      row.organization_id,

    companyName:
      row.companyName ??
      row.company_name,

    contactName:
      row.contactName ??
      row.contact_name,

    email:
      row.email,

    phone:
      row.phone,

    address:
      row.address,

    createdAt:
      row.createdAt ??
      row.created_at,

    updatedAt:
      row.updatedAt ??
      row.updated_at,
  } as Customer;
}

/**
 * Map invoice item from DB format to application format.
 *
 * Also calculates taxAmount and total when older/mock rows
 * do not contain those columns.
 */
function mapInvoiceItemRow(
  row: any,
): InvoiceItem {
  if (!row) {
    return row;
  }

  const quantity =
    row.quantity !== undefined
      ? Number(row.quantity)
      : 0;

  const unitPrice =
    row.unitPrice !== undefined
      ? Number(row.unitPrice)
      : Number(row.unit_price ?? 0);

  const taxRate =
    row.taxRate !== undefined
      ? Number(row.taxRate)
      : Number(row.tax_rate ?? 0);

  const calculatedSubtotal =
    roundMoney(
      quantity * unitPrice,
    );

  const calculatedTaxAmount =
    roundMoney(
      calculatedSubtotal *
        (taxRate / 100),
    );

  const calculatedTotal =
    roundMoney(
      calculatedSubtotal +
        calculatedTaxAmount,
    );

  return {
    ...row,

    invoiceId:
      row.invoiceId ??
      row.invoice_id,

    description:
      row.description,

    quantity,

    unitPrice,

    taxRate,

    taxAmount:
      row.taxAmount !== undefined
        ? Number(row.taxAmount)
        : Number(
            row.tax_amount ??
            calculatedTaxAmount,
          ),

    total:
      row.total !== undefined
        ? Number(row.total)
        : calculatedTotal,

    createdAt:
      row.createdAt ??
      row.created_at,

    updatedAt:
      row.updatedAt ??
      row.updated_at,
  } as InvoiceItem;
}

/**
 * Verify that a customer belongs to the current organization.
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
    .eq(
      'organization_id',
      organizationId,
    )
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

  let subtotalRaw = 0;
  let taxTotalRaw = 0;

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

    subtotalRaw += lineSubtotal;
    taxTotalRaw += lineTax;
  }

  const subtotal = roundMoney(subtotalRaw);
  const taxTotal = roundMoney(taxTotalRaw);

  const discount = roundMoney(
    Math.max(
      0,
      Number(requestedDiscount) || 0,
    ),
  );

  const grossTotal = roundMoney(
    subtotal + taxTotal,
  );

  if (discount > grossTotal) {
    throw new InvoiceError(
      'Discount exceeds the invoice total.',
      'INVALID_DISCOUNT',
      400,
    );
  }

  const total = roundMoney(
    grossTotal - discount,
  );

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
  requestedStatus: InvoiceStatus;
  amountPaid: number;
  totalAmount: number;
  dueDate: string;
}) {
  const totalAmount = roundMoney(
    Math.max(
      0,
      input.totalAmount,
    ),
  );

  let amountPaid = roundMoney(
    Math.max(
      0,
      input.amountPaid,
    ),
  );

  amountPaid = Math.min(
    amountPaid,
    totalAmount,
  );

  const amountDue = roundMoney(
    Math.max(
      0,
      totalAmount - amountPaid,
    ),
  );

  let status: InvoiceStatus;

  /*
   * Payment state has highest priority.
   */
  if (
    totalAmount > 0 &&
    amountDue === 0
  ) {
    status = 'paid';
  } else if (
    amountPaid > 0
  ) {
    status = 'partially_paid';
  } else {
    /*
     * Draft invoices remain drafts even when their
     * due date is in the past.
     *
     * Non-draft unpaid invoices become overdue when
     * the due date has passed.
     */
    const isPastDue =
      Boolean(input.dueDate) &&
      new Date(input.dueDate).getTime() <
        Date.now();

    if (
      input.requestedStatus !== 'draft' &&
      isPastDue
    ) {
      status = 'overdue';
    } else {
      status =
        input.requestedStatus;
    }
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

  const {
    subtotal,
    taxTotal,
    discount,
    total,
  } = computeFinancials(
    input.items,
    input.discount ?? 0,
  );

  const statusInput =
    input.status ?? 'draft';

  const {
    status,
    amountPaid,
    amountDue,
  } = resolveStatus({
    requestedStatus:
      statusInput as InvoiceStatus,
    amountPaid: 0,
    totalAmount: total,
    dueDate: input.dueDate,
  });

  const {
    data: inserted,
    error,
  } = await supabaseServer
    .from('invoices')
    .insert({
      organization_id:
        organizationId,

      customer_id:
        input.customerId,

      invoice_number:
        input.invoiceNumber,

      issue_date:
        input.issueDate,

      due_date:
        input.dueDate,

      currency:
        input.currency ?? 'INR',

      subtotal,

      tax_total:
        taxTotal,

      discount,

      total_amount:
        total,

      amount_paid:
        amountPaid,

      amount_due:
        amountDue,

      status,

      notes:
        input.notes ?? null,

      terms_and_conditions:
        input.termsAndConditions ?? null,

      created_by:
        userId,
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
   * Insert ALL invoice items in a single DB call.
   *
   * This fixes:
   * - unnecessary DB calls
   * - tests expecting one insert call
   * - missing tax_amount
   * - missing total
   */
  const itemRows =
    input.items.map((item) => {
      const financials =
        calculateItemFinancials(item);

      return {
        invoice_id:
          invoiceId,

        description:
          item.description,

        quantity:
          financials.quantity,

        unit_price:
          financials.unitPrice,

        tax_rate:
          financials.taxRate,

        tax_amount:
          financials.taxAmount,

        total:
          financials.total,
      };
    });

  const {
    error: itemError,
  } = await supabaseServer
    .from('invoice_items')
    .insert(itemRows);

  if (itemError) {
    logger.error(
      'createInvoice: item insert failed',
      {
        message:
          itemError.message,
        invoiceId,
      },
    );

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

  const invoice =
    await getInvoice(
      organizationId,
      invoiceId,
    );

  if (!invoice) {
    throw new InvoiceError(
      'Failed to fetch created invoice.',
      'FETCH_INVOICE_FAILED',
      500,
    );
  }

  return invoice;
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
    Math.max(
      1,
      Number(page) || 1,
    );

  const safeLimit =
    Math.min(
      100,
      Math.max(
        1,
        Number(limit) || 50,
      ),
    );

  let query = supabaseServer
    .from('invoices')
    .select(
      `
        *,
        customer:customers(*),
        items:invoice_items(*)
      `,
      {
        count: 'exact',
      },
    )
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
    const search =
      searchTerm.trim();

    query = query.or(
      `invoice_number.ilike.%${search}%`,
    );
  }

  const {
    data,
    error,
    count,
  } = await query
    .order(
      'created_at',
      {
        ascending: false,
      },
    )
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
        message:
          error.message,
        details:
          error.details,
        hint:
          error.hint,
        code:
          error.code,
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

  const lastPage =
    Math.ceil(
      total / safeLimit,
    );

  return {
    data:
      (data ?? []).map(
        mapInvoiceRow,
      ),

    total,

    page:
      safePage,

    limit:
      safeLimit,

    lastPage,
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
    .select(
      `
        *,
        customer:customers(*),
        items:invoice_items(*)
      `,
    )
    .eq(
      'organization_id',
      organizationId,
    )
    .eq(
      'id',
      invoiceId,
    )
    .maybeSingle();

  if (error) {
    logger.error(
      'Failed to get invoice',
      {
        message:
          error.message,
        invoiceId,
        organizationId,
      },
    );

    return null;
  }

  return data
    ? mapInvoiceRow(data)
    : null;
}

/* =========================================================
   UPDATE INVOICE
   ========================================================= */

export async function updateInvoice(
  organizationId: string,
  invoiceId: string,
  input: InvoiceUpdateInput,
): Promise<Invoice> {
  /*
   * First verify that the invoice belongs to
   * the current organization.
   *
   * This is important for IDOR protection.
   */
  const existing =
    await getInvoice(
      organizationId,
      invoiceId,
    );

  if (!existing) {
    throw new InvoiceError(
      'Invoice not found.',
      'INVOICE_NOT_FOUND',
      404,
    );
  }

  /*
   * Validate customer ownership when customerId changes.
   */
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
  }

  /*
   * Determine the items that should be used
   * for financial recalculation.
   */
  let items:
    | InvoiceItemInput[]
    | undefined;

  if (
    input.items !== undefined
  ) {
    items =
      input.items;
  } else if (
    (existing as any).items
      ?.length
  ) {
    items =
      (existing as any).items.map(
        (item: any) => ({
          description:
            item.description,

          quantity:
            Number(
              item.quantity,
            ),

          unitPrice:
            Number(
              item.unitPrice ??
              item.unit_price ??
              0,
            ),

          taxRate:
            Number(
              item.taxRate ??
              item.tax_rate ??
              0,
            ),
        }),
      );
  }

  const requestedDiscount =
    input.discount !== undefined
      ? input.discount
      : Number(
          (existing as any)
            .discount ?? 0,
        );

  const financials =
    items
      ? computeFinancials(
          items,
          requestedDiscount,
        )
      : null;

  const currentTotal =
    financials?.total ??
    Number(
      (existing as any)
        .totalAmount ??
      (existing as any)
        .total_amount ??
      0,
    );

  const currentAmountPaid =
    input.amountPaid !== undefined
      ? Number(input.amountPaid)
      : Number(
          (existing as any)
            .amountPaid ??
          (existing as any)
            .amount_paid ??
          0,
        );

  let requestedStatus =
    input.status ??
    ((existing as any)
      .status as InvoiceStatus);

  let amountPaid =
    currentAmountPaid;

  /*
   * Explicit paid status settles the
   * entire invoice.
   */
  if (
    requestedStatus === 'paid'
  ) {
    amountPaid =
      currentTotal;
  }

  const dueDate =
    input.dueDate ??
    String(
      (existing as any)
        .dueDate ??
      (existing as any)
        .due_date ??
      '',
    );

  const resolved =
    resolveStatus({
      requestedStatus,
      amountPaid,
      totalAmount:
        currentTotal,
      dueDate,
    });

  const updateData:
    Record<
      string,
      unknown
    > = {};

  if (
    input.customerId !== undefined
  ) {
    updateData.customer_id =
      input.customerId;
  }

  if (
    input.invoiceNumber !==
    undefined
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

  if (financials) {
    updateData.subtotal =
      financials.subtotal;

    updateData.tax_total =
      financials.taxTotal;

    updateData.discount =
      financials.discount;

    updateData.total_amount =
      financials.total;
  } else if (
    input.discount !== undefined
  ) {
    updateData.discount =
      roundMoney(
        input.discount,
      );
  }

  if (
    input.amountPaid !==
      undefined ||
    input.status !==
      undefined ||
    financials
  ) {
    updateData.amount_paid =
      resolved.amountPaid;

    updateData.amount_due =
      resolved.amountDue;

    updateData.status =
      resolved.status;
  } else if (
    input.dueDate !==
    undefined
  ) {
    /*
     * Due date changed, so status may need
     * to change to overdue even when no payment
     * or items changed.
     */
    updateData.amount_paid =
      resolved.amountPaid;

    updateData.amount_due =
      resolved.amountDue;

    updateData.status =
      resolved.status;
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

  const hasItemsUpdate =
    input.items !== undefined;

  /*
   * Empty update payload.
   */
  if (
    Object.keys(
      updateData,
    ).length === 0 &&
    !hasItemsUpdate
  ) {
    return existing;
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
    .eq(
      'id',
      invoiceId,
    )
    .select('*')
    .single();

  if (error) {
    if (
      isUniqueViolation(error)
    ) {
      throw new InvoiceError(
        'An invoice with this number already exists.',
        'CONFLICT',
        409,
      );
    }

    logger.error(
      'updateInvoice failed',
      {
        message:
          error.message,
        invoiceId,
        organizationId,
        error:
          error.message,
      },
    );

    throw new InvoiceError(
      'Failed to update invoice.',
      'UPDATE_INVOICE_FAILED',
      500,
    );
  }

  /*
   * Replace invoice items when new items
   * are supplied.
   */
  if (
    hasItemsUpdate &&
    input.items
  ) {
    const {
      error:
        deleteItemsError,
    } = await supabaseServer
      .from('invoice_items')
      .delete()
      .eq(
        'invoice_id',
        invoiceId,
      );

    if (
      deleteItemsError
    ) {
      logger.error(
        'Failed to delete old invoice items',
        {
          message:
            deleteItemsError.message,
          invoiceId,
        },
      );

      throw new InvoiceError(
        'Failed to update invoice items.',
        'UPDATE_INVOICE_FAILED',
        500,
      );
    }

    /*
     * Insert all replacement items
     * in ONE call.
     */
    const itemRows =
      input.items.map(
        (item) => {
          const financials =
            calculateItemFinancials(
              item,
            );

          return {
            invoice_id:
              invoiceId,

            description:
              item.description,

            quantity:
              financials.quantity,

            unit_price:
              financials.unitPrice,

            tax_rate:
              financials.taxRate,

            tax_amount:
              financials.taxAmount,

            total:
              financials.total,
          };
        },
      );

    const {
      error:
        itemError,
    } = await supabaseServer
      .from('invoice_items')
      .insert(itemRows);

    if (itemError) {
      logger.error(
        'Failed to insert updated invoice items',
        {
          message:
            itemError.message,
          invoiceId,
        },
      );

      throw new InvoiceError(
        'Failed to update invoice items.',
        'UPDATE_INVOICE_FAILED',
        500,
      );
    }
  }

  /*
   * Updating an invoice should NOT consume
   * the "invoices_created" quota.
   */
  const updated =
    await getInvoice(
      organizationId,
      invoiceId,
    );

  if (!updated) {
    return mapInvoiceRow(
      data,
    );
  }

  return updated;
}

/* =========================================================
   DELETE INVOICE
   ========================================================= */

export async function deleteInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<Invoice> {
  /*
   * Verify organization ownership first.
   *
   * This prevents deleting an invoice belonging
   * to another organization.
   */
  const existing =
    await getInvoice(
      organizationId,
      invoiceId,
    );

  if (!existing) {
    throw new InvoiceError(
      'Invoice not found.',
      'INVOICE_NOT_FOUND',
      404,
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
    .eq(
      'id',
      invoiceId,
    );

  if (error) {
    logger.error(
      'deleteInvoice failed',
      {
        message:
          error.message,
        invoiceId,
        organizationId,
      },
    );

    throw new InvoiceError(
      'Failed to delete invoice.',
      'DELETE_INVOICE_FAILED',
      500,
    );
  }

  /*
   * Deleting an invoice should NOT consume
   * the invoice creation quota.
   */

  return existing;
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
      `
        total_amount,
        amount_paid,
        amount_due,
        status
      `,
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
        message:
          error.message,
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
    count ??
    invoiceArray.length;

  const totalAmount =
    roundMoney(
      invoiceArray.reduce(
        (
          sum,
          invoice,
        ) =>
          sum +
          Number(
            invoice.total_amount ??
              0,
          ),
        0,
      ),
    );

  const totalPaid =
    roundMoney(
      invoiceArray.reduce(
        (
          sum,
          invoice,
        ) =>
          sum +
          Number(
            invoice.amount_paid ??
              0,
          ),
        0,
      ),
    );

  const totalDue =
    roundMoney(
      invoiceArray.reduce(
        (
          sum,
          invoice,
        ) =>
          sum +
          Number(
            invoice.amount_due ??
              0,
          ),
        0,
      ),
    );

  const pendingInvoices =
    invoiceArray.filter(
      (invoice) =>
        invoice.status ===
          'draft' ||
        invoice.status ===
          'sent' ||
        invoice.status ===
          'partially_paid' ||
        invoice.status ===
          'overdue',
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