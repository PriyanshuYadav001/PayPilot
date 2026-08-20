import crypto from 'node:crypto';
import type {
  FetchedPaymentDetails,
  IPaymentProvider,
  PaymentLinkRequest,
  PaymentLinkResponse,
  PaymentOrderRequest,
  PaymentOrderResponse,
  WebhookVerificationResult,
} from './PaymentProvider';

interface MockProviderOptions {
  webhookSecret?: string;
  appUrl?: string;
}

type Entity = Record<string, unknown>;

function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function timingSafeEqualHex(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function parsePayload(rawBody: string | Buffer): Entity | null {
  try {
    return JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as Entity;
  } catch {
    return null;
  }
}

function entityFrom(container: Entity, key: string): Entity {
  const value = container[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entity = (value as Entity).entity;
    return entity && typeof entity === 'object' && !Array.isArray(entity)
      ? entity as Entity
      : value as Entity;
  }
  return {};
}

function nestedPayment(entity: Entity): Entity | undefined {
  const payments = entity.payments;
  if (!Array.isArray(payments)) return undefined;
  const first = payments[0];
  if (!first || typeof first !== 'object') return undefined;
  const payment = (first as Entity).payment;
  return payment && typeof payment === 'object' ? entityFrom({ payment }, 'payment') : undefined;
}

/**
 * Deterministic, offline payment provider for local development and tests.
 * Webhook payloads intentionally use the same event and field conventions as
 * Razorpay so the existing payment service remains provider-independent.
 */
export class MockPaymentProvider implements IPaymentProvider {
  readonly name = 'mock';
  private readonly webhookSecret?: string;
  private readonly appUrl: string;

  constructor(options?: MockProviderOptions) {
    this.webhookSecret = options?.webhookSecret ?? process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
    this.appUrl = options?.appUrl ?? process.env.APP_URL ?? 'http://localhost:5173';
  }

  get isConfigured(): boolean {
    return Boolean(this.webhookSecret);
  }

  async createPaymentOrder(params: PaymentOrderRequest): Promise<PaymentOrderResponse> {
    const providerOrderId = `mock_order_${digest([
      params.organizationId,
      params.invoiceId,
      params.amountPaise,
      params.currency,
      params.receipt,
    ].join(':'))}`;

    return {
      providerOrderId,
      amountPaise: params.amountPaise,
      rawResponse: {
        id: providerOrderId,
        amount: params.amountPaise,
        currency: params.currency,
        receipt: params.receipt,
        status: 'created',
        notes: params.notes ?? {},
      },
    };
  }

  async createPaymentLink(params: PaymentLinkRequest): Promise<PaymentLinkResponse> {
    const token = `mock_${digest([
      params.organizationId,
      params.invoiceId,
      params.amountPaise,
      params.currency,
      params.description,
    ].join(':'))}`;
    const providerLinkId = `mock_link_${digest(`${token}:link`)}`;
    const shortUrl = `${this.appUrl.replace(/\/$/, '')}/pay/${token}`;

    return {
      providerLinkId,
      shortUrl,
      status: 'created',
      rawResponse: {
        id: providerLinkId,
        short_url: shortUrl,
        amount: params.amountPaise,
        currency: params.currency,
        status: 'created',
        expire_by: params.expiryDate?.toISOString(),
      },
    };
  }

  async cancelPaymentLink(providerLinkId: string): Promise<boolean> {
    return providerLinkId.startsWith('mock_link_');
  }

  async verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    secret?: string,
  ): Promise<WebhookVerificationResult> {
    const payload = parsePayload(rawBody);
    const configuredSecret = secret ?? this.webhookSecret;
    if (!payload || !configuredSecret) {
      return { isValid: false, event: 'unknown', rawPayload: payload ?? {} };
    }

    const expected = crypto.createHmac('sha256', configuredSecret).update(rawBody).digest('hex');
    if (!timingSafeEqualHex(expected, signature)) {
      return { isValid: false, event: 'unknown', rawPayload: payload };
    }

    const event = String(payload.event ?? 'unknown');
    const eventId = payload.event_id as string | undefined;
    const container = payload.payload && typeof payload.payload === 'object'
      ? payload.payload as Entity
      : payload;

    if (event === 'payment.initiated' || event === 'order.paid') {
      const order = entityFrom(container, 'order');
      const payment = nestedPayment(order);
      const amount = Number(order.amount ?? payment?.amount ?? 0);
      return {
        isValid: true,
        event: 'payment.initiated',
        eventId,
        paymentId: payment?.id as string | undefined,
        orderId: (order.id as string | undefined) ?? (payment?.order_id as string | undefined),
        amount: amount > 0 ? amount / 100 : undefined,
        currency: (order.currency ?? payment?.currency) as string | undefined,
        method: payment?.method as string | undefined,
        rawPayload: payload,
      };
    }

    if (event === 'payment.captured' || event === 'payment.failed') {
      const payment = entityFrom(container, 'payment');
      const amount = Number(payment.amount ?? 0);
      return {
        isValid: true,
        event: event === 'payment.failed' ? 'payment.failed' : 'payment.captured',
        eventId,
        paymentId: payment.id as string | undefined,
        orderId: payment.order_id as string | undefined,
        amount: amount > 0 ? amount / 100 : undefined,
        currency: payment.currency as string | undefined,
        method: payment.method as string | undefined,
        rawPayload: payload,
      };
    }

    if (event === 'refund.processed' || event === 'payment.refunded') {
      const refund = entityFrom(container, 'refund');
      const amount = Number(refund.amount ?? 0);
      return {
        isValid: true,
        event: 'payment.refunded',
        eventId,
        paymentId: (refund.payment_id as string | undefined) ?? (refund.payment as Entity | undefined)?.id as string | undefined,
        amount: amount > 0 ? amount / 100 : undefined,
        currency: refund.currency as string | undefined,
        rawPayload: payload,
      };
    }

    if (event === 'payment_link.paid') {
      const paymentLink = entityFrom(container, 'payment_link');
      const payment = nestedPayment(paymentLink);
      const amount = Number(paymentLink.amount ?? payment?.amount ?? 0);
      return {
        isValid: true,
        event: 'payment_link.paid',
        eventId,
        paymentId: payment?.id as string | undefined,
        orderId: payment?.order_id as string | undefined,
        paymentLinkId: paymentLink.id as string | undefined,
        amount: amount > 0 ? amount / 100 : undefined,
        currency: (paymentLink.currency ?? payment?.currency) as string | undefined,
        method: payment?.method as string | undefined,
        rawPayload: payload,
      };
    }

    return { isValid: true, event: 'unknown', eventId, rawPayload: payload };
  }

  async fetchPaymentDetails(paymentId: string): Promise<FetchedPaymentDetails> {
    const stableAmount = (parseInt(digest(paymentId).slice(0, 6), 16) % 100000) / 100 + 1;
    return {
      status: 'captured',
      amount: stableAmount,
      method: 'upi',
      paidAt: new Date(0),
    };
  }
}
