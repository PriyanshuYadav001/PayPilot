import { apiRequest } from './apiClient';
import type { ApiResponse } from './apiClient';
import type { Invoice, InvoiceItem, InvoiceStatus } from '@shared/types';

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface InvoiceInput {
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

export interface InvoiceListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: InvoiceStatus;
  customerId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface InvoiceListResult {
  invoices: Invoice[];
  pagination: Pagination;
}

const DEFAULT_PAGINATION: Pagination = { page: 1, limit: 20, totalCount: 0, totalPages: 0 };

function buildQuery(params: InvoiceListParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.search !== undefined && params.search.trim() !== '') search.set('search', params.search.trim());
  if (params.status !== undefined) search.set('status', params.status);
  if (params.customerId !== undefined) search.set('customerId', params.customerId);
  if (params.sortBy !== undefined) search.set('sortBy', params.sortBy);
  if (params.sortOrder !== undefined) search.set('sortOrder', params.sortOrder);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function throwOnFailure<T>(response: ApiResponse<T>, fallback: string): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error?.message || fallback);
  }
  return response.data;
}

export async function listInvoices(
  orgId: string,
  token: string,
  params: InvoiceListParams = {}
): Promise<InvoiceListResult> {
  const response = await apiRequest<{ invoices: Invoice[] }>(`/invoices${buildQuery(params)}`, {
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to load invoices.');
  return {
    invoices: data.invoices,
    pagination: response.pagination ?? DEFAULT_PAGINATION,
  };
}

export async function getInvoice(orgId: string, token: string, id: string): Promise<Invoice> {
  const response = await apiRequest<{ invoice: Invoice }>(`/invoices/${id}`, { orgId, token });
  const data = throwOnFailure(response, 'Failed to load invoice.');
  return data.invoice;
}

export async function createInvoice(
  orgId: string,
  token: string,
  input: InvoiceInput
): Promise<Invoice> {
  const response = await apiRequest<{ invoice: Invoice }>('/invoices', {
    method: 'POST',
    body: JSON.stringify(input),
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to create invoice.');
  return data.invoice;
}

export async function updateInvoice(
  orgId: string,
  token: string,
  id: string,
  input: InvoiceUpdateInput
): Promise<Invoice> {
  const response = await apiRequest<{ invoice: Invoice }>(`/invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to update invoice.');
  return data.invoice;
}

export async function deleteInvoice(orgId: string, token: string, id: string): Promise<void> {
  const response = await apiRequest<unknown>(`/invoices/${id}`, {
    method: 'DELETE',
    orgId,
    token,
  });
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to delete invoice.');
  }
}

export interface InvoiceFileResult {
  path: string;
  fileName: string;
  size: number;
  contentType: string;
}

export interface InvoiceFileSignedResult {
  signedUrl: string;
  fileName: string;
  expiresIn: number;
}

export async function uploadInvoiceFile(
  orgId: string,
  token: string,
  invoiceId: string,
  file: File
): Promise<InvoiceFileResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiRequest<{ file: InvoiceFileResult }>(`/invoices/${invoiceId}/upload`, {
    method: 'POST',
    body: formData,
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to upload invoice file.');
  return data.file;
}

export async function getInvoiceFileUrl(
  orgId: string,
  token: string,
  invoiceId: string
): Promise<InvoiceFileSignedResult> {
  const response = await apiRequest<{ file: InvoiceFileSignedResult }>(`/invoices/${invoiceId}/file`, {
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to load invoice file.');
  return data.file;
}

export type { InvoiceItem };
