import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type { Invoice, InvoiceItem, InvoiceStatus } from '../../shared/types';

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
  status?: InvoiceStatus;
  dueDate?: string;
  notes?: string;
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  customerId?: string;
  organizationId?: string;
  dueDateStart?: string;
  dueDateEnd?: string;
}

export interface InvoiceListResult {
  invoices: Invoice[];
  data: Invoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  lastPage: number;
}

export class InvoiceService {
  async createInvoice(
    organizationId: string,
    _userId: string,
    input: InvoiceCreateInput,
  ): Promise<Invoice>;
  async createInvoice(input: InvoiceCreateInput): Promise<Invoice>;
  async createInvoice(
    organizationOrInput: string | InvoiceCreateInput,
    userOrInput?: string | InvoiceCreateInput,
    legacyInput?: InvoiceCreateInput,
  ): Promise<Invoice> {
    const organizationId = typeof organizationOrInput === 'string'
      ? organizationOrInput
      : undefined;
    const input = typeof organizationOrInput === 'string'
      ? legacyInput
      : organizationOrInput;
    if (!input) throw new Error('Invoice input is required');

    const orgId = organizationId;
    if (!orgId) throw new Error('Organization is required');
    const { data, error } = await supabaseServer
      .from('invoices')
      .insert({
        organization_id: orgId,
        customer_id: input.customerId,
        invoice_number: input.invoiceNumber,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        currency: input.currency ?? 'USD',
        discount: input.discount ?? 0,
        status: input.status ?? 'draft',
        notes: input.notes,
        terms_and_conditions: input.termsAndConditions,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating invoice:', error);
      throw error;
    }

    if (input.items.length > 0) {
      const items = input.items.map((item) => ({
        invoice_id: data.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tax: item.taxRate ?? 0,
        total: item.quantity * item.unitPrice,
      }));
      const { error: itemError } = await supabaseServer.from('invoice_items').insert(items);
      if (itemError) throw itemError;
    }

    return data as unknown as Invoice;
  }

  async getInvoices(filters?: InvoiceFilters): Promise<InvoiceListResult>;
  async getInvoices(
    organizationId: string,
    customerId?: string,
    status?: InvoiceStatus,
    _search?: string,
    page?: number,
    limit?: number,
  ): Promise<InvoiceListResult>;
  async getInvoices(
    filtersOrOrganization: InvoiceFilters | string = {},
    customerId?: string,
    status?: InvoiceStatus,
    _search?: string,
    page = 1,
    limit = 20,
  ): Promise<InvoiceListResult> {
    const filters: InvoiceFilters = typeof filtersOrOrganization === 'string'
      ? { organizationId: filtersOrOrganization, customerId, status }
      : filtersOrOrganization;
    let query = supabaseServer
      .from('invoices')
      .select('*, invoice_items(*)', { count: 'exact' });

    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters.dueDateStart) query = query.gte('due_date', filters.dueDateStart);
    if (filters.dueDateEnd) query = query.lte('due_date', filters.dueDateEnd);

    const { data, error, count } = await query.order('due_date', { ascending: true });
    if (error) throw error;

    const invoices = (data ?? []) as unknown as Invoice[];
    const total = count ?? invoices.length;
    const lastPage = Math.max(1, Math.ceil(total / limit));
    return { invoices, data: invoices, total, page, limit, totalPages: lastPage, lastPage };
  }

  async getInvoice(_organizationOrId: string, legacyId?: string): Promise<Invoice> {
    const id = legacyId ?? _organizationOrId;
    const { data, error } = await supabaseServer
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as unknown as Invoice;
  }

  async updateInvoice(
    organizationId: string,
    id: string,
    input: InvoiceUpdateInput,
  ): Promise<Invoice>;
  async updateInvoice(id: string, input: InvoiceUpdateInput): Promise<Invoice>;
  async updateInvoice(
    organizationOrId: string,
    idOrInput: string | InvoiceUpdateInput,
    legacyInput?: InvoiceUpdateInput,
  ): Promise<Invoice> {
    const id = typeof idOrInput === 'string' ? idOrInput : organizationOrId;
    const input = typeof idOrInput === 'string' ? legacyInput : idOrInput;
    if (!input) throw new Error('Invoice update is required');
    const { data, error } = await supabaseServer
      .from('invoices')
      .update({
        status: input.status,
        due_date: input.dueDate,
        notes: input.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Invoice;
  }

  async deleteInvoice(_organizationOrId: string, legacyId?: string): Promise<void> {
    const id = legacyId ?? _organizationOrId;
    const { error } = await supabaseServer.from('invoices').delete().eq('id', id);
    if (error) throw error;
  }

  static async getInvoices(
    organizationId: string,
    customerId?: string,
    status?: InvoiceStatus,
    search?: string,
    page = 1,
    limit = 100,
  ): Promise<InvoiceListResult> {
    return invoiceService.getInvoices(organizationId, customerId, status, search, page, limit);
  }

  static get instance(): InvoiceService {
    return invoiceService;
  }
}

export const invoiceService = new InvoiceService();
export const InvoiceServiceStatic = InvoiceService;

export async function getInvoice(organizationId: string, invoiceId: string): Promise<Invoice> {
  return invoiceService.getInvoice(organizationId, invoiceId);
}

export type { InvoiceItem };
