import { describe, it, expect, vi, beforeEach } from 'vitest';

const usageMocks = vi.hoisted(() => ({
  checkLimit: vi.fn(),
  recordUsage: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn().mockResolvedValue({ id: 'comm-1' }),
  getInvoice: vi.fn(),
  createPaymentLink: vi.fn(),
}));

vi.mock('../../server/services/usageService', () => ({
  Metric: {
    invoices_created: 'invoices_created',
    whatsapp_sent: 'whatsapp_sent',
    emails_sent: 'emails_sent',
    calls_made: 'calls_made',
    ai_analyses: 'ai_analyses',
  },

  checkLimit: usageMocks.checkLimit,
  recordUsage: usageMocks.recordUsage,

  // Keep this in case another part of the test imports it.
  checkAndRecordUsage: vi.fn(),
}));

vi.mock('../../server/services/communication/communicationService', () => ({
  communicationService: {
    sendMessage: mocks.sendMessage,
  },
}));

vi.mock('../../server/services/invoiceService', () => ({
  invoiceService: {
    getInvoice: mocks.getInvoice,
  },
}));

vi.mock('../../server/services/payment/paymentService', () => ({
  createPaymentLink: (...args: unknown[]) =>
    mocks.createPaymentLink(...args),
}));

/**
 * Mock Supabase client
 *
 * The important part here is that the query builder supports
 * all methods used by the services under test, especially:
 *
 * .insert()
 *
 * The previous mock did not implement .insert(), which caused:
 *
 * supabaseServer.from(...).insert is not a function
 */
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};

  const from = vi.fn((table: string) => {
    const cfg = tables[table] ?? {};

    const chain = {
      /**
       * SELECT
       */
      select(_cols?: unknown, _opts?: unknown) {
        return chain;
      },

      /**
       * FILTERS
       */
      eq(_col: unknown, _val: unknown) {
        return chain;
      },

      neq(_col: unknown, _val: unknown) {
        return chain;
      },

      gt(_col: unknown, _val: unknown) {
        return chain;
      },

      gte(_col: unknown, _val: unknown) {
        return chain;
      },

      lt(_col: unknown, _val: unknown) {
        return chain;
      },

      lte(_col: unknown, _val: unknown) {
        return chain;
      },

      in(_col: unknown, _val: unknown) {
        return chain;
      },

      is(_col: unknown, _val: unknown) {
        return chain;
      },

      /**
       * SORTING / PAGINATION
       */
      order(_col: unknown, _opts?: unknown) {
        return chain;
      },

      limit(_n: unknown) {
        return chain;
      },

      range(_from: unknown, _to: unknown) {
        return chain;
      },

      /**
       * INSERT
       *
       * This was missing from the original mock.
       *
       * usageService.ts calls:
       *
       * supabaseServer
       *   .from('usage_records')
       *   .insert({...})
       */
      insert(_values: unknown) {
        return chain;
      },

      /**
       * UPDATE
       */
      update(_values: unknown) {
        return chain;
      },

      /**
       * UPSERT
       */
      upsert(_values: unknown, _options?: unknown) {
        return chain;
      },

      /**
       * DELETE
       */
      delete() {
        return chain;
      },

      /**
       * SINGLE RESULT
       */
      single() {
        return Promise.resolve({
          data: cfg.single ?? null,
          error: cfg.singleError ?? null,
        });
      },

      /**
       * OPTIONAL SINGLE RESULT
       */
      maybeSingle() {
        return Promise.resolve({
          data: cfg.single ?? null,
          error: cfg.singleError ?? null,
        });
      },

      /**
       * Allow the query chain to be awaited directly.
       *
       * Example:
       *
       * const { data, error } = await supabase
       *   .from('table')
       *   .select('*')
       *   .eq(...)
       */
      then(
        resolve: (value: {
          data: unknown;
          error: unknown;
        }) => unknown,
      ) {
        return Promise.resolve({
          data: cfg.data ?? [],
          error: cfg.error ?? null,
        }).then(resolve);
      },
    };

    return chain;
  });

  return {
    supabaseServer: {
      from,
    },
    tables,
  };
});

vi.mock('../../server/lib/supabaseClient', () => ({
  supabaseServer: m.supabaseServer,
}));

import {
  sendInvoiceReminder,
  sendOverdueReminder,
  sendPaymentLink,
  sendPaymentConfirmation,
  sendPaymentPromiseReminder,
} from '../../server/services/email/emailService';

const ORG_ID = 'org-1';
const CUSTOMER_ID = 'cust-1';
const INVOICE_ID = 'inv-1';

const CUSTOMER = {
  id: CUSTOMER_ID,
  companyName: 'Globex Ltd',
  contactName: 'Jane Doe',
  email: 'jane@globex.com',
  phone: '+919876543210',
  isDnd: false,
  creditPeriodDays: 30,
  billingAddress: {},
  metadata: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const INVOICE = {
  id: INVOICE_ID,
  organizationId: ORG_ID,
  customerId: CUSTOMER_ID,
  invoiceNumber: 'INV-001',
  issueDate: '2026-08-01',
  dueDate: '2026-09-01',
  currency: 'INR',
  subtotal: 1000,
  taxTotal: 180,
  discount: 0,
  totalAmount: 1180,
  amountPaid: 0,
  amountDue: 1180,
  status: 'sent' as const,
  isFollowUpActive: true,
  customer: CUSTOMER,
  items: [],
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

describe('Email Follow-Up Service', () => {
  beforeEach(() => {
    /**
     * Reset all mocks between tests.
     */
    vi.clearAllMocks();

    /**
     * Restore default mocked service behaviour.
     */
    mocks.getInvoice.mockResolvedValue({ ...INVOICE });

    mocks.createPaymentLink.mockResolvedValue({
      shortUrl: 'https://pay.test/default',
    });

    mocks.sendMessage.mockResolvedValue({
      id: 'comm-1',
    });

    /**
     * Mock organization lookup.
     */
    m.tables.organizations = {
      single: {
        id: ORG_ID,
        name: 'Test Business',
      },
      singleError: null,
    };

    /**
     * Default payment link:
     * no existing active link.
     */
    m.tables.payment_links = {
      single: null,
      singleError: null,
    };

    /**
     * usage_records needs to succeed when usageService
     * calls .insert().
     *
     * Since insert() now returns the chain and the chain
     * is awaitable, this resolves successfully.
     */
    m.tables.usage_records = {
      data: [],
      error: null,
    };
  });

  describe('sendInvoiceReminder', () => {
    it('sends an invoice reminder email with correct content', async () => {
      await sendInvoiceReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      expect(mocks.sendMessage).toHaveBeenCalledOnce();

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[0]).toBe(ORG_ID);
      expect(call[1].channel).toBe('email');
      expect(call[1].customerId).toBe(CUSTOMER_ID);
      expect(call[1].invoiceId).toBe(INVOICE_ID);
      expect(call[1].subject).toContain('INV-001');
      expect(call[1].message).toContain('Jane Doe');
      expect(call[1].message).toContain('Test Business');
      expect(call[1].message).toContain('1,180.00');
      expect(call[1].message).toContain('Pay Now');
      expect(call[1].metadata.type).toBe('invoice_reminder');
    });

    it('includes payment link in email when available', async () => {
      m.tables.payment_links = {
        single: {
          short_url: 'https://pay.test/abc',
          status: 'active',
          expires_at: '2099-12-31',
        },
        singleError: null,
      };

      await sendInvoiceReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      const message = mocks.sendMessage.mock.calls[0][1].message;

      expect(message).toContain('https://pay.test/abc');
    });

    it('creates a new payment link when none exists', async () => {
      m.tables.payment_links = {
        single: null,
        singleError: null,
      };

      mocks.createPaymentLink.mockResolvedValue({
        shortUrl: 'https://pay.test/new',
      });

      await sendInvoiceReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      expect(mocks.createPaymentLink).toHaveBeenCalledOnce();

      expect(
        mocks.createPaymentLink.mock.calls[0][0],
      ).toBe(ORG_ID);

      expect(
        mocks.createPaymentLink.mock.calls[0][1].invoiceId,
      ).toBe(INVOICE_ID);
    });
  });

  describe('sendOverdueReminder', () => {
    it('sends an overdue reminder with overdue-themed content', async () => {
      await sendOverdueReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      expect(mocks.sendMessage).toHaveBeenCalledOnce();

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[1].subject).toContain('INV-001');
      expect(call[1].message).toContain('Overdue');
      expect(call[1].metadata.type).toBe('overdue_reminder');
      expect(call[1].metadata.daysRelativeToDue).toBe(7);
    });
  });

  describe('sendPaymentLink', () => {
    it('sends a payment link email with secure URL', async () => {
      m.tables.payment_links = {
        single: {
          short_url: 'https://pay.test/xyz',
          status: 'active',
          expires_at: '2099-12-31',
        },
        singleError: null,
      };

      await sendPaymentLink({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[1].subject).toContain('INV-001');
      expect(call[1].message).toContain('https://pay.test/xyz');
      expect(call[1].message).toContain('Secure Payment Link');
      expect(call[1].metadata.type).toBe('payment_link');
    });
  });

  describe('sendPaymentConfirmation', () => {
    it('sends a payment confirmation with paid amount', async () => {
      await sendPaymentConfirmation({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
        amountPaid: 1180,
      });

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[1].subject).toContain('INV-001');
      expect(call[1].subject).toContain('Confirmed');
      expect(call[1].message).toContain('Payment Received');
      expect(call[1].message).toContain('1,180.00');
      expect(call[1].metadata.type).toBe('payment_confirmation');
    });
  });

  describe('sendPaymentPromiseReminder', () => {
    it('sends a promise reminder with promise date', async () => {
      await sendPaymentPromiseReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
        promiseDate: '2026-09-15',
      });

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[1].subject).toContain('INV-001');
      expect(call[1].subject).toContain('Promise');
      expect(call[1].message).toContain('2026-09-15');
      expect(call[1].message).toContain('committed');
      expect(call[1].metadata.type).toBe(
        'payment_promise_reminder',
      );
      expect(call[1].metadata.promiseDate).toBe('2026-09-15');
    });
  });

  describe('Error handling', () => {
    it('throws when invoice is not found', async () => {
      mocks.getInvoice.mockResolvedValue(null);

      await expect(
        sendInvoiceReminder({
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          invoiceId: INVOICE_ID,
        }),
      ).rejects.toThrow('Invoice inv-1 not found');
    });

    it('throws when customer has no email', async () => {
      mocks.getInvoice.mockResolvedValue({
        ...INVOICE,
        customer: {
          ...CUSTOMER,
          email: null,
        },
      });

      await expect(
        sendInvoiceReminder({
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          invoiceId: INVOICE_ID,
        }),
      ).rejects.toThrow('no email address');
    });

    it('throws when customer has DND enabled', async () => {
      mocks.getInvoice.mockResolvedValue({
        ...INVOICE,
        customer: {
          ...CUSTOMER,
          isDnd: true,
        },
      });

      await expect(
        sendInvoiceReminder({
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          invoiceId: INVOICE_ID,
        }),
      ).rejects.toThrow('Do Not Disturb');
    });

    it('retries and fails after max retries', async () => {
      mocks.sendMessage.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(
        sendInvoiceReminder({
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          invoiceId: INVOICE_ID,
        }),
      ).rejects.toThrow('Network error');

      expect(mocks.sendMessage).toHaveBeenCalledTimes(3);
    });
  });
});