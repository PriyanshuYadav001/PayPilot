import { apiRequest } from './apiClient';
import type { ApiResponse } from './apiClient';

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

export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

function throwOnFailure<T>(response: ApiResponse<T>, fallback: string): T {
  if (!response.success || response.data === undefined) {
    throw new ApiError(response.error?.code || 'REQUEST_FAILED', response.error?.message || fallback);
  }
  return response.data;
}

export async function getPublicPaymentPage(token: string): Promise<PublicPaymentPage> {
  const response = await apiRequest<{ paymentPage: PublicPaymentPage }>(`/public/payment-links/${token}`);
  const data = throwOnFailure(response, 'Failed to load payment details.');
  return data.paymentPage;
}

export async function createPublicCheckout(token: string): Promise<PublicCheckout> {
  const response = await apiRequest<{ checkout: PublicCheckout }>(`/public/payment-links/${token}/payments`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = throwOnFailure(response, 'Failed to start payment.');
  return data.checkout;
}
