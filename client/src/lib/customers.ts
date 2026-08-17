import { apiRequest } from './apiClient';
import type { ApiResponse } from './apiClient';
import type { Customer } from '@shared/types';

export interface CustomerInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  whatsappNumber?: string;
  gstin?: string;
  billingAddress?: Record<string, unknown>;
  creditPeriodDays?: number;
  isDnd?: boolean;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  isDnd?: 'true' | 'false';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface CustomerListResult {
  customers: Customer[];
  pagination: Pagination;
}

const DEFAULT_PAGINATION: Pagination = { page: 1, limit: 20, totalCount: 0, totalPages: 0 };

function buildQuery(params: CustomerListParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.search !== undefined && params.search.trim() !== '') search.set('search', params.search.trim());
  if (params.isDnd !== undefined) search.set('isDnd', params.isDnd);
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

export async function listCustomers(
  orgId: string,
  token: string,
  params: CustomerListParams = {}
): Promise<CustomerListResult> {
  const response = await apiRequest<{ customers: Customer[] }>(`/customers${buildQuery(params)}`, {
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to load customers.');
  return {
    customers: data.customers,
    pagination: response.pagination ?? DEFAULT_PAGINATION,
  };
}

export async function getCustomer(orgId: string, token: string, id: string): Promise<Customer> {
  const response = await apiRequest<{ customer: Customer }>(`/customers/${id}`, { orgId, token });
  const data = throwOnFailure(response, 'Failed to load customer.');
  return data.customer;
}

export async function createCustomer(
  orgId: string,
  token: string,
  input: CustomerInput
): Promise<Customer> {
  const response = await apiRequest<{ customer: Customer }>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to create customer.');
  return data.customer;
}

export async function updateCustomer(
  orgId: string,
  token: string,
  id: string,
  input: Partial<CustomerInput>
): Promise<Customer> {
  const response = await apiRequest<{ customer: Customer }>(`/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to update customer.');
  return data.customer;
}

export async function deleteCustomer(orgId: string, token: string, id: string): Promise<void> {
  const response = await apiRequest<unknown>(`/customers/${id}`, {
    method: 'DELETE',
    orgId,
    token,
  });
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to delete customer.');
  }
}
