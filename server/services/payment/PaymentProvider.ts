/**
 * Payment provider abstraction.
 *
 * Amounts crossing this boundary are always in minor units (paise) to avoid
 * floating point drift. The payment service is responsible for converting from
 * the major-unit amounts stored in the database.
 */

export class PaymentProviderError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'PaymentProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class PaymentError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface PaymentOrderRequest {
  organizationId: string;
  invoiceId: string;
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface PaymentOrderResponse {
  providerOrderId: string;
  amountPaise: number;
  rawResponse: Record<string, unknown>;
}

export interface PaymentLinkRequest {
  organizationId: string;
  invoiceId: string;
  amountPaise: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  description: string;
  dueDate: Date;
  expiryDate?: Date;
  callbackUrl?: string;
}

export interface PaymentLinkResponse {
  providerLinkId: string;
  shortUrl: string;
  qrCodeUrl?: string;
  status: 'created' | 'paid' | 'expired' | 'cancelled';
  rawResponse: Record<string, unknown>;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  event:
    | 'payment.initiated'
    | 'payment.captured'
    | 'payment.failed'
    | 'payment.refunded'
    | 'payment_link.paid'
    | 'unknown';
  eventId?: string;
  paymentId?: string;
  orderId?: string;
  paymentLinkId?: string;
  amount?: number;
  currency?: string;
  method?: string;
  rawPayload: Record<string, unknown>;
}

export interface FetchedPaymentDetails {
  status: 'captured' | 'failed' | 'refunded';
  amount: number;
  method: string;
  paidAt: Date;
}

export interface IPaymentProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  readonly keyId?: string;
  createPaymentOrder(params: PaymentOrderRequest): Promise<PaymentOrderResponse>;
  createPaymentLink(params: PaymentLinkRequest): Promise<PaymentLinkResponse>;
  cancelPaymentLink(providerLinkId: string): Promise<boolean>;
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    secret?: string
  ): Promise<WebhookVerificationResult>;
  fetchPaymentDetails(paymentId: string): Promise<FetchedPaymentDetails>;
}
