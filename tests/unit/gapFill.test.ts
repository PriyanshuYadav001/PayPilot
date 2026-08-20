import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isValidCronSecret } from '../../server/routes/cronAuth';
import { MockPaymentProvider } from '../../server/services/payment/MockPaymentProvider';

describe('cron secret authentication', () => {
  it('rejects an unset configured secret', () => {
    expect(isValidCronSecret('secret', undefined)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(isValidCronSecret('wrong', 'expected')).toBe(false);
  });

  it('accepts a matching secret', () => {
    expect(isValidCronSecret('expected', 'expected')).toBe(true);
  });
});

describe('MockPaymentProvider', () => {
  const secret = 'test-webhook-secret';
  const provider = new MockPaymentProvider({ webhookSecret: secret, appUrl: 'http://localhost:5173' });

  it('verifies valid and invalid webhook signatures', async () => {
    const body = JSON.stringify({
      event: 'payment.captured',
      event_id: 'evt_1',
      payment: { id: 'pay_1', order_id: 'ord_1', amount: 12500, currency: 'INR', method: 'upi' },
    });
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const valid = await provider.verifyWebhookSignature(body, signature);
    const invalid = await provider.verifyWebhookSignature(body, `${signature}0`);

    expect(valid.isValid).toBe(true);
    expect(valid.event).toBe('payment.captured');
    expect(valid.paymentId).toBe('pay_1');
    expect(valid.orderId).toBe('ord_1');
    expect(valid.amount).toBe(125);
    expect(invalid.isValid).toBe(false);
  });

  it('maps payment-link events and produces deterministic local ids', async () => {
    const body = JSON.stringify({
      event: 'payment_link.paid',
      event_id: 'evt_link_1',
      payment_link: {
        id: 'plink_1',
        amount: 5000,
        currency: 'INR',
        payment: { id: 'pay_2', order_id: 'ord_2', method: 'card' },
      },
    });
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const result = await provider.verifyWebhookSignature(body, signature);
    const first = await provider.createPaymentOrder({
      organizationId: 'org_1',
      invoiceId: 'inv_1',
      amountPaise: 5000,
      currency: 'INR',
      receipt: 'INV-1',
    });
    const second = await provider.createPaymentOrder({
      organizationId: 'org_1',
      invoiceId: 'inv_1',
      amountPaise: 5000,
      currency: 'INR',
      receipt: 'INV-1',
    });

    expect(result.event).toBe('payment_link.paid');
    expect(result.paymentLinkId).toBe('plink_1');
    expect(first.providerOrderId).toBe(second.providerOrderId);
    expect(first.providerOrderId).toMatch(/^mock_/);
    expect((await provider.createPaymentLink({
      organizationId: 'org_1',
      invoiceId: 'inv_1',
      amountPaise: 5000,
      currency: 'INR',
      customerName: 'Customer',
      customerEmail: 'customer@example.com',
      description: 'Invoice INV-1',
      dueDate: new Date('2025-01-01'),
    })).shortUrl).toMatch(/^http:\/\/localhost:5173\/pay\/mock_/);
  });
});
