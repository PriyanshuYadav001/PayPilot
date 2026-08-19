import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type {
  Invoice,
  InvoiceItem,
  Customer,
  InvoiceStatus,
} from '../../shared/types';

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
  total: number;
  page: number;
  totalPages: number;
}

let serviceInstance: InvoiceService | null = null;

export class InvoiceService {
  constructor() {
    if (!serviceInstance) {
      serviceInstance = this;
    }
    return serviceInstance;
  }

  async createInvoice(input: InvoiceCreateInput): Promise<Invoice> {
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

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        organization_id: org.id,
        customer_id: input.customerId,
        invoice_number: input.invoiceNumber,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        currency: input.currency || 'USD',
        discount: input.discount ?? 0,
        status: input.status || 'draft',
        notes: input.notes,
        terms_and_conditions: input.termsAndConditions,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating invoice:', error);
      throw error;
    }

    // Create invoice items
    if (input.items && input.items.length > 0) {
      const itemsToInsert = input.items.map((item) => ({
        invoice_id: data.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tax: item.taxRate ?? 0,
        total: item.quantity * item.unitPrice,
      }));

      await supabase.from('invoice_items').insert(itemsToInsert);
    }

    return data as Invoice;
  }

  async getInvoices(filters: InvoiceFilters = {}): Promise<InvoiceListResult> {
    const {
      supabase,
    } = supabaseServer();

    let query = supabase.from('invoices').select('*, invoice_items(*)', {
      count: 'exact',
    });

    // Apply organization filter (RLS should handle this, but we add safety)
    if (filters.organizationId) {
      query = query.eq('organization_id', filters.organizationId);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }

    if (filters.dueDateStart) {
      query = query.gte('due_date', filters.dueDateStart);
    }

    if (filters.dueDateEnd) {
      query = query.lte('due_date', filters.dueDateEnd);
    }

    const { data, error, count } = await query.order('due_date', { ascending: true });

    if (error) {
      logger.error('Error fetching invoices:', error);
      throw error;
    }

    return {
      invoices: data as Invoice[],
      total: count ?? 0,
      page: 1,
      totalPages: 1,
    };
  }

  async getInvoice(id: string): Promise<Invoice> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching invoice:', error);
      throw error;
    }

    return data as Invoice;
  }

  async updateInvoice(
    id: string,
    input: InvoiceUpdateInput
  ): Promise<Invoice> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
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

    if (error) {
      logger.error('Error updating invoice:', error);
      throw error;
    }

    return data as Invoice;
  }

  async deleteInvoice(id: string): Promise<void> {
    const {
      supabase,
    } = supabaseServer();

    const { error } = await supabase.from('invoices').delete().eq('id', id);

    if (error) {
      logger.error('Error deleting invoice:', error);
      throw error;
    }
  }

  // Static accessor for singleton instance
  static get instance(): InvoiceService {
    if (!serviceInstance) {
      serviceInstance = new InvoiceService();
    }
    return serviceInstance;
  }
}

// Allow static method calls for convenience
export const InvoiceServiceStatic = InvoiceService;

// Export singleton instance
export const invoiceService = new InvoiceService();

// Export types
export type { InvoiceItemInput, InvoiceCreateInput, InvoiceUpdateInput, InvoiceFilters, InvoiceListResult };