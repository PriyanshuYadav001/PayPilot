import crypto from 'node:crypto';
import {
  IPaymentProvider,
  PaymentLinkRequest,
  PaymentLinkResponse,
  PaymentOrderRequest,
  PaymentOrderResponse,
  PaymentProviderError,
  WebhookVerificationResult,
} from './PaymentProvider';
import { logger } from '../../utils/logger';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

interface RazorpayEnvOptions {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

/**
 * Razorpay provider backed by the REST API.
 *
 * Credentials are read from RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET and the
 * webhook signing secret from RAZORPAY_WEBHOOK_SECRET. Secrets are never
 * logged or exposed to the client; only the public key id is surfaced (needed
 * by the Razorpay Checkout SDK).
 */
export class RazorpayProvider implements IPaymentProvider {
  readonly name = 'razorpay';

  private readonly privateKeyId?: string;
  private readonly keySecret?: string;
  private readonly webhookSecret?: string;

  constructor(options?: RazorpayEnvOptions) {
    this.privateKeyId = options?.keyId ?? process.env.RAZORPAY_KEY_ID;
    this.keySecret = options?.keySecret ?? process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = options?.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET;
  }

  get isConfigured(): boolean {
    return Boolean(this.privateKeyId && this.keySecret);
  }

  get keyId(): string | undefined {
    return this.privateKeyId;
  }

  private requireCredentials(): { auth: string; keyId: string } {
    if (!this.privateKeyId || !this.keySecret) {
      throw new PaymentProviderError(
        'Payment provider credentials are not configured. Configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
        'PAYMENT_PROVIDER_NOT_CONFIGURED',
        503
      );
    }
    const auth = `Basic ${Buffer.from(`${this.privateKeyId}:${this.keySecret}`).toString('base64')}`;
    return { auth, keyId: this.privateKeyId };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const { auth } = this.requireCredentials();

    const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // Non-JSON responses are still surfaced below with the status code.
    }

    if (!response.ok) {
      const message =
        (body.error as { description?: string } | undefined)?.description ??
        `Razorpay API error ${response.status}.`;
      throw new PaymentProviderError(message, 'PAYMENT_PROVIDER_ERROR', 502);
    }

    return body as unknown as T;
  }

  async createPaymentOrder(params: PaymentOrderRequest): Promise<PaymentOrderResponse> {
    this.requireCredentials();
    const rawResponse = await this.request<{ id: string; amount: number }>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: params.amountPaise,
        currency: params.currency,
        receipt: params.receipt,
        notes: {
          organization_id: params.organizationId,
          invoice_id: params.invoiceId,
          ...(params.notes ?? {}),
        },
      }),
    });

    if (!rawResponse?.id) {
      throw new PaymentProviderError('Razorpay did not return an order id.', 'PAYMENT_PROVIDER_ERROR', 502);
    }

    return {
      providerOrderId: rawResponse.id,
      amountPaise: rawResponse.amount,
      rawResponse: rawResponse as unknown as Record<string, unknown>,
    };
  }

  async createPaymentLink(params: PaymentLinkRequest): Promise<PaymentLinkResponse> {
    const body: Record<string, unknown> = {
      amount: params.amountPaise,
      currency: params.currency,
      description: params.description,
      customer: {
        name: params.customerName,
        email: params.customerEmail,
        ...(params.customerPhone ? { contact: params.customerPhone } : {}),
      },
      notify: { email: true, sms: false, whatsapp: false },
      notes: {
        organization_id: params.organizationId,
        invoice_id: params.invoiceId,
      },
      callback_method: 'get',
      ...(params.expiryDate ? { expire_by: Math.floor(params.expiryDate.getTime() / 1000) } : {}),
      ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
    };

    const rawResponse = await this.request<{
      id: string;
      short_url: string;
      status: string;
    }>('/payment_links', { method: 'POST', body: JSON.stringify(body) });

    if (!rawResponse?.id || !rawResponse?.short_url) {
      throw new PaymentProviderError('Razorpay did not return a payment link.', 'PAYMENT_PROVIDER_ERROR', 502);
    }

    return {
      providerLinkId: rawResponse.id,
      shortUrl: rawResponse.short_url,
      status: rawResponse.status === 'paid' ? 'paid' : 'created',
      rawResponse: rawResponse as unknown as Record<string, unknown>,
    };
  }

  async cancelPaymentLink(providerLinkId: string): Promise<boolean> {
    await this.request<{ id: string; status: string }>(`/payment_links/${providerLinkId}/cancel`, {
      method: 'POST',
    });
    return true;
  }

  async verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    secret?: string
  ): Promise<WebhookVerificationResult> {
    const signingSecret = secret ?? this.webhookSecret;
    if (!signingSecret) {
      logger.warn('Razorpay webhook rejected: webhook secret is not configured.');
      return { isValid: false, event: 'unknown', rawPayload: {} };
    }

    const expected = crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex');
    const provided = String(signature ?? '').trim();
    const isValid = expected.length === provided.length && crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(provided, 'hex')
    );

    if (!isValid) {
      return { isValid: false, event: 'unknown', rawPayload: {} };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      return { isValid: false, event: 'unknown', rawPayload: {} };
    }

    const event = String(payload.event ?? 'unknown');
    const eventId = payload.event_id as string | undefined;
    const entityContainer = (payload.payload as Record<string, unknown> | undefined) ?? {};

    if (event === 'payment.initiated' || event === 'order.paid') {
      const orderEntity = (entityContainer.order as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};
      const payments = Array.isArray(orderEntity.payments) ? orderEntity.payments : [];
      const firstPayment = (payments[0] as { payment?: { entity?: Record<string, unknown> } } | undefined)
        ?.payment?.entity;
      const amount = Number(orderEntity.amount ?? 0);
      return {
        isValid: true,
        event: 'payment.initiated',
        eventId,
        paymentId: firstPayment?.id as string | undefined,
        orderId: (orderEntity.id as string | undefined) ?? (firstPayment?.order_id as string | undefined),
        amount: amount > 0 ? amount / 100 : undefined,
        currency: orderEntity.currency as string | undefined,
        method: firstPayment?.method as string | undefined,
        rawPayload: payload,
      };
    }

    if (event === 'payment.captured' || event === 'payment.failed') {
      const entity = (entityContainer.payment as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};
      const amount = Number(entity.amount ?? 0);
      return {
        isValid: true,
        event: event === 'payment.failed' ? 'payment.failed' : 'payment.captured',
        eventId,
        paymentId: entity.id as string | undefined,
        orderId: entity.order_id as string | undefined,
        amount: amount > 0 ? amount / 100 : undefined,
        currency: entity.currency as string | undefined,
        method: entity.method as string | undefined,
        rawPayload: payload,
      };
    }

    if (event === 'refund.processed' || event === 'payment.refunded') {
      const refundEntity = (entityContainer.refund as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};
      const amount = Number(refundEntity.amount ?? 0);
      return {
        isValid: true,
        event: 'payment.refunded',
        eventId,
        paymentId: (refundEntity.payment_id as string | undefined) ?? (refundEntity.payment as { entity?: { id?: string } } | undefined)?.entity?.id,
        amount: amount > 0 ? amount / 100 : undefined,
        currency: refundEntity.currency as string | undefined,
        rawPayload: payload,
      };
    }

    if (event === 'payment_link.paid') {
      const linkEntity = (entityContainer.payment_link as { entity?: Record<string, unknown> } | undefined)?.entity ?? {};
      const payments = Array.isArray(linkEntity.payments) ? linkEntity.payments : [];
      const paymentEntity = (payments[0] as { payment?: { entity?: Record<string, unknown> } } | undefined)
        ?.payment?.entity;
      const amount = Number(linkEntity.amount ?? 0);
      return {
        isValid: true,
        event: 'payment_link.paid',
        eventId,
        paymentId: paymentEntity?.id as string | undefined,
        orderId: paymentEntity?.order_id as string | undefined,
        paymentLinkId: linkEntity.id as string | undefined,
        amount: amount > 0 ? amount / 100 : undefined,
        currency: linkEntity.currency as string | undefined,
        method: paymentEntity?.method as string | undefined,
        rawPayload: payload,
      };
    }

    return { isValid: true, event: 'unknown', eventId, rawPayload: payload };
  }

  async fetchPaymentDetails(paymentId: string): Promise<{ status: 'captured' | 'failed' | 'refunded'; amount: number; method: string; paidAt: Date }> {
    const rawResponse = await this.request<{
      id: string;
      amount: number;
      method: string;
      status: string;
      captured_at?: number;
    }>(`/payments/${paymentId}`, { method: 'GET' });

    const status = rawResponse.status === 'captured' ? 'captured' : rawResponse.status === 'failed' ? 'failed' : 'refunded';
    return {
      status,
      amount: Number(rawResponse.amount) / 100,
      method: rawResponse.method,
      paidAt: new Date((rawResponse.captured_at ?? Date.now()) * 1000),
    };
  }
}
