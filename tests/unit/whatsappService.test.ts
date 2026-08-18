import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const mockSendMessage = vi.fn();
const mockGetInvoice = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock('../../server/lib/supabaseClient', () => ({
  supabaseServer: { from: (...args: unknown[]) => mockSupabaseFrom(...args) },
}));

vi.mock('../../server/services/communication/communicationService', () => ({
  communicationService: { sendMessage: mockSendMessage },
}));

vi.mock('../../server/services/invoiceService', () => ({
  invoiceService: { getInvoice: mockGetInvoice },
}));

vi.mock('../../server/services/payment/paymentService', () => ({
  createPaymentLink: vi.fn().mockResolvedValue({ shortUrl: 'https://pay.test/inv1' }),
}));

const TEST_ORG = '11111111-1111-1111-1111-111111111111';
const TEST_CUST = '22222222-2222-2222-2222-222222222222';
const TEST_INV = '33333333-3333-3333-3333-333333333333';

const mockCustomer = {
  id: TEST_CUST,
  contactName: 'Pri',
  companyName: 'TestCo',
  email: 'pri@test.com',
  phone: '+919876543210',
  whatsappNumber: '+919876543210',
  isDnd: false,
};

const mockInvoice = {
  id: TEST_INV,
  invoiceNumber: 'INV-001',
  amountDue: 10000,
  currency: 'INR',
  dueDate: '2026-08-25',
  customer: mockCustomer,
};

function mockOrgQuery(name: string) {
  const orgChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { name }, error: null }),
  };
  return orgChain;
}

function mockPaymentLinksQuery(hasLink: boolean) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(
      hasLink
        ? { data: { short_url: 'https://pay.test/existing', status: 'active', expires_at: null }, error: null }
        : { data: null, error: null },
    ),
  };
  return chain;
}

describe('WhatsApp Follow-Up Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInvoice.mockResolvedValue(mockInvoice);

    const mockSupabaseFrom = vi.fn();
mockSupabaseFrom.mockImplementation((table: string) => {
  if (table === 'organizations') return mockOrgQuery('Acme Corp');
  if (table === 'payment_links') return mockPaymentLinksQuery(true);
  if (table === 'usage_records') return {
    select: vi.fn().mockResolvedValue({ data: { count: 0 }, error: null }),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    gte: vi.fn().mockReturnValue({
      lt: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    lt: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
  // Full mock support for all supabase query methods used in the codebase
  return {
    select: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    gte: vi.fn().mockReturnValue({
      lt: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    lt: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
});
  });

  describe('sendInvoiceReminder', () => {
    it('sends a WhatsApp invoice reminder with correct content', async () => {
      const { whatsappService } = await import('../../server/services/whatsapp/whatsappService');
      await whatsappService.sendInvoiceReminder({
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(mockSendMessage).toHaveBeenCalledOnce();
      const call = mockSendMessage.mock.calls[0];
      expect(call[0]).toBe(TEST_ORG);
      expect(call[1].channel).toBe('whatsapp');
      expect(call[1].message).toContain('INV-001');
      expect(call[1].message).toContain('₹10,000');
      expect(call[1].message).toContain('25 August 2026');
      expect(call[1].message).toContain('Pay now: https://pay.test/existing');
      expect(call[1].metadata.type).toBe('invoice_reminder');
    });

    it('throws when customer has no phone number', async () => {
      mockGetInvoice.mockResolvedValue({
        ...mockInvoice,
        customer: { ...mockCustomer, whatsappNumber: null, phone: null },
      });

      const { whatsappService } = await import('../../server/services/whatsapp/whatsappService');
      await expect(
        whatsappService.sendInvoiceReminder({
          organizationId: TEST_ORG,
          customerId: TEST_CUST,
          invoiceId: TEST_INV,
        }),
      ).rejects.toThrow('no WhatsApp or phone number');
    });

    it('throws when customer is DND', async () => {
      mockGetInvoice.mockResolvedValue({
        ...mockInvoice,
        customer: { ...mockCustomer, isDnd: true },
      });

      const { whatsappService } = await import('../../server/services/whatsapp/whatsappService');
      await expect(
        whatsappService.sendInvoiceReminder({
          organizationId: TEST_ORG,
          customerId: TEST_CUST,
          invoiceId: TEST_INV,
        }),
      ).rejects.toThrow('Do Not Disturb');
    });
  });

  describe('sendOverdueReminder', () => {
    it('sends an overdue WhatsApp message', async () => {
      const { whatsappService } = await import('../../server/services/whatsapp/whatsappService');
      await whatsappService.sendOverdueReminder({
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(mockSendMessage).toHaveBeenCalledOnce();
      const msg = mockSendMessage.mock.calls[0][1].message;
      expect(msg).toContain('overdue');
      expect(msg).toContain('INV-001');
      expect(msg).toContain('₹10,000');
      expect(msg).toContain('Pay now: https://pay.test/existing');
    });
  });

  describe('sendPaymentLink', () => {
    it('sends a payment link via WhatsApp', async () => {
      const { whatsappService } = await import('../../server/services/whatsapp/whatsappService');
      await whatsappService.sendPaymentLink(
        {
          organizationId: TEST_ORG,
          customerId: TEST_CUST,
          invoiceId: TEST_INV,
        },
        TEST_ORG,
      );

      expect(mockSendMessage).toHaveBeenCalledOnce();
      const msg = mockSendMessage.mock.calls[0][1].message;
      expect(msg).toContain('INV-001');
      expect(msg).toContain('Pay securely: https://pay.test/existing');
    });
  });

  describe('sendPaymentPromiseReminder', () => {
    it('sends a promise reminder with date', async () => {
      const { whatsappService } = await import('../../server/services/whatsapp/whatsappService');
      await whatsappService.sendPaymentPromiseReminder({
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(mockSendMessage).toHaveBeenCalledOnce();
      const msg = mockSendMessage.mock.calls[0][1].message;
      expect(msg).toContain('promised to pay');
      expect(msg).toContain('20 August 2026');
      expect(msg).toContain('INV-001');
    });

    it('sends a promise reminder without date', async () => {
      const { whatsappService } = await import('../../server/services/whatsapp/whatsappService');
      await whatsappService.sendPaymentPromiseReminder({
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(mockSendMessage).toHaveBeenCalledOnce();
      const msg = mockSendMessage.mock.calls[0][1].message;
      expect(msg).toContain('awaiting payment');
    });
  });
});

describe('WhatsAppClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    it('returns true for valid HMAC-SHA256 signature', async () => {
      process.env.WHATSAPP_APP_SECRET = 'test-secret-key';
      const { WhatsAppClient } = await import('../../server/services/whatsapp/WhatsAppClient');
      const client = new WhatsAppClient({ appSecret: 'test-secret-key' });

      const body = '{"object":"whatsapp_business_account"}';
      const signature = crypto
        .createHmac('sha256', 'test-secret-key')
        .update(body)
        .digest('hex');

      expect(client.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('returns false for invalid signature', async () => {
      const { WhatsAppClient } = await import('../../server/services/whatsapp/WhatsAppClient');
      const client = new WhatsAppClient({ appSecret: 'test-secret-key' });

      expect(client.verifyWebhookSignature('body', 'deadbeef'.repeat(8))).toBe(false);
    });

    it('returns false when app secret is not configured', async () => {
      const { WhatsAppClient } = await import('../../server/services/whatsapp/WhatsAppClient');
      const client = new WhatsAppClient({ appSecret: '' });

      expect(client.verifyWebhookSignature('body', 'sig')).toBe(false);
    });
  });
});
