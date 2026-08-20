import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type { Customer } from '../../shared/types';
import type { Database, Json } from '../../types/database.types';
import { toJson } from '../utils/json';

export interface CustomerListParams {
  page: number;
  limit: number;
  search?: string;
  isDnd?: 'true' | 'false';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CustomerListResult {
  customers: Customer[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

const SORTABLE_COLUMNS = [
  'company_name',
  'contact_name',
  'email',
  'phone',
  'created_at',
  'updated_at',
];

export class CustomerError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'CustomerError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sanitizeSearchTerm(term: string): string {
  return term.replace(/[^a-zA-Z0-9@._\s-]/g, '').trim();
}

function optionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function mapRow(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    companyName: row.company_name as string,
    contactName: row.contact_name as string,
    email: row.email as string,
    phone: (row.phone as string | null) ?? undefined,
    whatsappNumber: (row.whatsapp_number as string | null) ?? undefined,
    gstin: (row.gstin as string | null) ?? undefined,
    billingAddress: (row.billing_address as Record<string, unknown>) ?? {},
    creditPeriodDays: row.credit_period_days as number,
    isDnd: row.is_dnd as boolean,
    notes: (row.notes as string | null) ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toCreatePayload(
  input: Record<string, unknown>,
  organizationId: string,
): Database['public']['Tables']['customers']['Insert'] {
  return {
    organization_id: organizationId,
    company_name: String(input.companyName ?? ''),
    contact_name: String(input.contactName ?? ''),
    email: String(input.email ?? ''),
    ...(input.phone !== undefined ? { phone: optionalString(input.phone) } : {}),
    ...(input.whatsappNumber !== undefined ? { whatsapp_number: optionalString(input.whatsappNumber) } : {}),
    ...(input.gstin !== undefined ? { gstin: optionalString(input.gstin) } : {}),
    billing_address: toJson(input.billingAddress ?? {}),
    credit_period_days: Number(input.creditPeriodDays ?? 30),
    is_dnd: Boolean(input.isDnd ?? false),
    ...(input.notes !== undefined ? { notes: optionalString(input.notes) } : {}),
    metadata: toJson(input.metadata ?? {}),
  };
}

function toUpdatePayload(input: Record<string, unknown>): Database['public']['Tables']['customers']['Update'] {
  const payload: Database['public']['Tables']['customers']['Update'] = {};
  if (input.companyName !== undefined) payload.company_name = String(input.companyName);
  if (input.contactName !== undefined) payload.contact_name = String(input.contactName);
  if (input.email !== undefined) payload.email = String(input.email);
  if (input.phone !== undefined) payload.phone = String(input.phone);
  if (input.whatsappNumber !== undefined) payload.whatsapp_number = String(input.whatsappNumber);
  if (input.gstin !== undefined) payload.gstin = String(input.gstin);
  if (input.billingAddress !== undefined) payload.billing_address = toJson(input.billingAddress);
  if (input.creditPeriodDays !== undefined) payload.credit_period_days = Number(input.creditPeriodDays);
  if (input.isDnd !== undefined) payload.is_dnd = Boolean(input.isDnd);
  if (input.notes !== undefined) payload.notes = String(input.notes);
  if (input.metadata !== undefined) payload.metadata = toJson(input.metadata);
  return payload;
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error?.code === '23505';
}

/**
 * Fetches a single customer scoped to the given organization.
 * Returns null when the customer does not exist in this org (never throws),
 * which prevents cross-tenant reads/writes (IDOR protection).
 */
async function findCustomer(organizationId: string, customerId: string): Promise<Customer | null> {
  const { data, error } = await supabaseServer
    .from('customers')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    logger.error('findCustomer failed', error.message);
    throw new CustomerError('Failed to load customer.', 'CUSTOMER_READ_FAILED', 500);
  }

  return data ? mapRow(data) : null;
}

export async function listCustomers(
  organizationId: string,
  params: CustomerListParams
): Promise<CustomerListResult> {
  const { page, limit } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseServer.from('customers').select('*', { count: 'exact' });

  query = query.eq('organization_id', organizationId);

  if (params.isDnd) {
    query = query.eq('is_dnd', params.isDnd === 'true');
  }

  if (params.search) {
    const term = sanitizeSearchTerm(params.search);
    if (term) {
      query = query.or(`company_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%`);
    }
  }

  const sortBy = params.sortBy && SORTABLE_COLUMNS.includes(params.sortBy) ? params.sortBy : 'created_at';
  const ascending = params.sortOrder === 'asc';

  query = query.order(sortBy, { ascending });
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error('listCustomers failed', error.message);
    throw new CustomerError('Failed to list customers.', 'CUSTOMER_LIST_FAILED', 500);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const totalCount = count ?? rows.length;

  return {
    customers: rows.map(mapRow),
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
  };
}

export async function getCustomer(organizationId: string, customerId: string): Promise<Customer | null> {
  return findCustomer(organizationId, customerId);
}

export async function createCustomer(
  organizationId: string,
  input: Record<string, unknown>
): Promise<Customer> {
  const { data, error } = await supabaseServer
    .from('customers')
    .insert(toCreatePayload(input, organizationId))
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new CustomerError('A customer with this email already exists.', 'CONFLICT', 409);
    }
    logger.error('createCustomer failed', error.message);
    throw new CustomerError('Failed to create customer.', 'CUSTOMER_CREATE_FAILED', 500);
  }

  return mapRow(data as Record<string, unknown>);
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  input: Record<string, unknown>
): Promise<Customer | null> {
  const existing = await findCustomer(organizationId, customerId);
  if (!existing) {
    return null;
  }

  const { data, error } = await supabaseServer
    .from('customers')
    .update(toUpdatePayload(input))
    .eq('organization_id', organizationId)
    .eq('id', customerId)
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new CustomerError('A customer with this email already exists.', 'CONFLICT', 409);
    }
    logger.error('updateCustomer failed', error.message);
    throw new CustomerError('Failed to update customer.', 'CUSTOMER_UPDATE_FAILED', 500);
  }

  return mapRow(data as Record<string, unknown>);
}

export async function deleteCustomer(
  organizationId: string,
  customerId: string
): Promise<Customer | null> {
  const existing = await findCustomer(organizationId, customerId);
  if (!existing) {
    return null;
  }

  const { error } = await supabaseServer
    .from('customers')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', customerId);

  if (error) {
    logger.error('deleteCustomer failed', error.message);
    throw new CustomerError('Failed to delete customer.', 'CUSTOMER_DELETE_FAILED', 500);
  }

  return existing;
}

export const customerService = {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
