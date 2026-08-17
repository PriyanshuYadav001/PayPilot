import { apiRequest } from './apiClient';
import type { ApiResponse } from './apiClient';
import type { Payment, PaymentLink } from '@shared/types';

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

function throwOnFailure<T>(response: ApiResponse<T>, fallback: string): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error?.message || fallback);
  }
  return response.data;
}

export async function createPaymentLink(
  orgId: string,
  token: string,
  input: PaymentLinkCreateInput
): Promise<PaymentLink> {
  const response = await apiRequest<{ paymentLink: PaymentLink }>('/payment-links', {
    method: 'POST',
    body: JSON.stringify(input),
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to create payment link.');
  return data.paymentLink;
}

export async function getPaymentLink(
  orgId: string,
  token: string,
  linkId: string
): Promise<PaymentLink> {
  const response = await apiRequest<{ paymentLink: PaymentLink }>(`/payment-links/${linkId}`, {
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to load payment link.');
  return data.paymentLink;
}

export async function createPayment(
  orgId: string,
  token: string,
  input: PaymentCreateInput
): Promise<PaymentCreateResult> {
  const response = await apiRequest<PaymentCreateResult>('/payments/create', {
    method: 'POST',
    body: JSON.stringify(input),
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to create payment order.');
  return {
    payment: data.payment,
    providerOrderId: data.providerOrderId,
    amountPaise: data.amountPaise,
    keyId: data.keyId,
  };
}

export async function listInvoicePayments(
  orgId: string,
  token: string,
  invoiceId: string
): Promise<Payment[]> {
  const response = await apiRequest<{ payments: Payment[] }>(`/invoices/${invoiceId}/payments`, {
    orgId,
    token,
  });
  const data = throwOnFailure(response, 'Failed to load payments.');
  return data.payments;
}
