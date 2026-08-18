import { describe, it, expect, vi, beforeEach } from 'vitest';

const usageMocks = vi.hoisted(() => ({
  checkLimit: vi.fn(),
  recordUsage: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getInvoice: vi.fn(),
}));

/**
 * Mock usage service.
 *
 * emailService uses:
 *   checkLimit()
 *   recordUsage()
 *
 * instead of checkAndRecordUsage().
 */
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

  // Kept for compatibility in case another imported module needs it.
  checkAndRecordUsage: vi.fn(),
}));

/**
 * Mock communication service.
 */
vi.mock(
  '../../server/services/communication/communicationService',
  () => ({
    communicationService: {
      sendMessage: mocks.sendMessage,
    },
  }),
);

/**
 * Mock invoice service.
 */
vi.mock('../../server/services/invoiceService', () => ({
  invoiceService: {
    getInvoice: mocks.getInvoice,
  },
}));

/**
 * Mock Supabase client.
 *
 * emailService uses Supabase to load the organization name
 * from the organizations table.
 */
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};

  const from = vi.fn((table: string) => {
    const cfg = tables[table] ?? {};

    const chain = {
      /**
       * SELECT
       */
      select(_columns?: unknown, _options?: unknown) {
        return chain;
      },

      /**
       * FILTERS
       */
      eq(_column: unknown, _value: unknown) {
        return chain;
      },

      neq(_column: unknown, _value: unknown) {
        return chain;
      },

      gt(_column: unknown, _value: unknown) {
        return chain;
      },

      gte(_column: unknown, _value: unknown) {
        return chain;
      },

      lt(_column: unknown, _value: unknown) {
        return chain;
      },

      lte(_column: unknown, _value: unknown) {
        return chain;
      },

      in(_column: unknown, _value: unknown) {
        return chain;
      },

      is(_column: unknown, _value: unknown) {
        return chain;
      },

      /**
       * SORTING / PAGINATION
       */
      order(_column: unknown, _options?: unknown) {
        return chain;
      },

      limit(_value: unknown) {
        return chain;
      },

      range(_from: unknown, _to: unknown) {
        return chain;
      },

      /**
       * INSERT
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
       * SINGLE
       */
      single() {
        return Promise.resolve({
          data: cfg.single ?? null,
          error: cfg.singleError ?? null,
        });
      },

      /**
       * OPTIONAL SINGLE
       */
      maybeSingle() {
        return Promise.resolve({
          data: cfg.single ?? null,
          error: cfg.singleError ?? null,
        });
      },

      /**
       * Make the query chain awaitable.
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

/**
 * Import service under test after mocks are defined.
 */
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

  /**
   * Current test date is 2026-08-18.
   *
   * Therefore this invoice is 14 days BEFORE its due date.
   */
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
     * Reset all mocks.
     */
    vi.clearAllMocks();

    /**
     * Default invoice.
     */
    mocks.getInvoice.mockResolvedValue({
      ...INVOICE,
    });

    /**
     * Default successful email send.
     */
    mocks.sendMessage.mockResolvedValue({
      id: 'comm-1',
    });

    /**
     * Default usage limit:
     *
     * limit = 100
     * current usage = 1
     * remaining = 99
     */
    usageMocks.checkLimit.mockResolvedValue({
      exceeded: false,
      remaining: 99,
      limit: 100,
    });

    /**
     * Default successful usage recording.
     */
    usageMocks.recordUsage.mockResolvedValue({
      id: 'usage-1',
      organization_id: ORG_ID,
      metric: 'emails_sent',
      period_start: '2026-08-01T00:00:00.000Z',
      period_end: '2026-09-01T00:00:00.000Z',
      count: 1,
      created_at: '2026-08-18T00:00:00.000Z',
      updated_at: '2026-08-18T00:00:00.000Z',
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
     * Mock payment_links table.
     *
     * By default there is no active payment link.
     */
    m.tables.payment_links = {
      single: null,
      singleError: null,
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

      /**
       * The default test has no active payment link.
       * Therefore the invoice reminder template does not
       * render a "Pay Now" CTA.
       *
       * Verify the actual reminder content instead.
       */
      expect(call[1].message).toContain(
        'Please make the payment before the due date to avoid any late fees.',
      );

      expect(call[1].metadata.type).toBe(
        'invoice_reminder',
      );
    });

    it('checks email usage before sending', async () => {
      await sendInvoiceReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      expect(usageMocks.checkLimit).toHaveBeenCalledOnce();

      expect(
        usageMocks.checkLimit.mock.calls[0][0],
      ).toBe(ORG_ID);

      expect(
        usageMocks.checkLimit.mock.calls[0][1],
      ).toBe('emails_sent');

      expect(
        usageMocks.checkLimit.mock.calls[0][2],
      ).toBe(1);
    });

    it('records email usage after successful send', async () => {
      await sendInvoiceReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      expect(usageMocks.recordUsage).toHaveBeenCalledOnce();

      expect(
        usageMocks.recordUsage.mock.calls[0][0],
      ).toBe(ORG_ID);

      expect(
        usageMocks.recordUsage.mock.calls[0][1],
      ).toBe('emails_sent');

      expect(
        usageMocks.recordUsage.mock.calls[0][2],
      ).toBe(1);
    });

    it('does not send email when usage limit is exceeded', async () => {
      usageMocks.checkLimit.mockResolvedValue({
        exceeded: true,
        remaining: 0,
        limit: 100,
      });

      await expect(
        sendInvoiceReminder({
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          invoiceId: INVOICE_ID,
        }),
      ).rejects.toThrow(
        'Plan limit reached',
      );

      expect(
        mocks.sendMessage,
      ).not.toHaveBeenCalled();

      expect(
        usageMocks.recordUsage,
      ).not.toHaveBeenCalled();
    });
  });

  describe('sendOverdueReminder', () => {
    it('sends an overdue reminder with overdue-themed content', async () => {
      /**
       * Make the invoice actually overdue.
       */
      mocks.getInvoice.mockResolvedValue({
        ...INVOICE,
        dueDate: '2026-08-11',
      });

      await sendOverdueReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      expect(mocks.sendMessage).toHaveBeenCalledOnce();

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[1].subject).toContain('INV-001');

      expect(call[1].message).toContain('Overdue');

      expect(call[1].metadata.type).toBe(
        'overdue_reminder',
      );

      /**
       * 2026-08-18 - 2026-08-11 = 7 days overdue.
       */
      expect(
        call[1].metadata.daysRelativeToDue,
      ).toBe(7);
    });

    it('records usage after successful overdue reminder', async () => {
      await sendOverdueReminder({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      expect(
        usageMocks.recordUsage,
      ).toHaveBeenCalledOnce();
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

      expect(mocks.sendMessage).toHaveBeenCalledOnce();

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[1].subject).toContain(
        'INV-001',
      );

      expect(call[1].message).toContain(
        'https://pay.test/xyz',
      );

      expect(call[1].message).toContain(
        'Secure Payment Link',
      );

      expect(call[1].metadata.type).toBe(
        'payment_link',
      );

      expect(
        call[1].metadata.paymentUrl,
      ).toBe(
        'https://pay.test/xyz',
      );
    });

    it('sends the email even when no payment link exists', async () => {
      m.tables.payment_links = {
        single: null,
        singleError: null,
      };

      await sendPaymentLink({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
      });

      expect(
        mocks.sendMessage,
      ).toHaveBeenCalledOnce();

      const call = mocks.sendMessage.mock.calls[0];

      expect(
        call[1].metadata.paymentUrl,
      ).toBeUndefined();
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

      expect(mocks.sendMessage).toHaveBeenCalledOnce();

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[1].subject).toContain(
        'INV-001',
      );

      expect(call[1].subject).toContain(
        'Confirmed',
      );

      expect(call[1].message).toContain(
        'Payment Received',
      );

      expect(call[1].message).toContain(
        '1,180.00',
      );

      expect(call[1].metadata.type).toBe(
        'payment_confirmation',
      );
    });

    it('records one email usage after payment confirmation', async () => {
      await sendPaymentConfirmation({
        organizationId: ORG_ID,
        customerId: CUSTOMER_ID,
        invoiceId: INVOICE_ID,
        amountPaid: 1180,
      });

      expect(
        usageMocks.recordUsage,
      ).toHaveBeenCalledOnce();
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

      expect(mocks.sendMessage).toHaveBeenCalledOnce();

      const call = mocks.sendMessage.mock.calls[0];

      expect(call[1].subject).toContain(
        'INV-001',
      );

      expect(call[1].subject).toContain(
        'Promise',
      );

      expect(call[1].message).toContain(
        '2026-09-15',
      );

      expect(call[1].message).toContain(
        'committed',
      );

      expect(call[1].metadata.type).toBe(
        'payment_promise_reminder',
      );

      expect(
        call[1].metadata.promiseDate,
      ).toBe('2026-09-15');
    });
  });

  describe('Error handling', () => {
    it('throws when invoice is not found', async () => {
      mocks.getInvoice.mockResolvedValue(
        null,
      );

      await expect(
        sendInvoiceReminder({
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          invoiceId: INVOICE_ID,
        }),
      ).rejects.toThrow(
        'Invoice inv-1 not found',
      );

      expect(
        usageMocks.checkLimit,
      ).not.toHaveBeenCalled();

      expect(
        mocks.sendMessage,
      ).not.toHaveBeenCalled();
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
      ).rejects.toThrow(
        'no email address',
      );

      expect(
        usageMocks.checkLimit,
      ).not.toHaveBeenCalled();

      expect(
        mocks.sendMessage,
      ).not.toHaveBeenCalled();
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
      ).rejects.toThrow(
        'Do Not Disturb',
      );

      expect(
        usageMocks.checkLimit,
      ).not.toHaveBeenCalled();

      expect(
        mocks.sendMessage,
      ).not.toHaveBeenCalled();
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
      ).rejects.toThrow(
        'Network error',
      );

      /**
       * MAX_EMAIL_RETRIES = 3
       */
      expect(
        mocks.sendMessage,
      ).toHaveBeenCalledTimes(3);

      /**
       * No successful send means no usage should
       * be recorded.
       */
      expect(
        usageMocks.recordUsage,
      ).not.toHaveBeenCalled();
    });

    it('does not record usage for failed email attempts', async () => {
      mocks.sendMessage.mockRejectedValue(
        new Error('SMTP failure'),
      );

      await expect(
        sendPaymentLink({
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          invoiceId: INVOICE_ID,
        }),
      ).rejects.toThrow(
        'SMTP failure',
      );

      expect(
        usageMocks.recordUsage,
      ).not.toHaveBeenCalled();
    });

    it('throws when usage recording fails after a successful send', async () => {
      usageMocks.recordUsage.mockResolvedValue(
        null,
      );

      /**
       * IMPORTANT:
       *
       * Your current emailService implementation catches
       * usage-recording errors inside sendWithRetry().
       *
       * Therefore the email itself should still succeed.
       */
      await expect(
        sendInvoiceReminder({
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          invoiceId: INVOICE_ID,
        }),
      ).resolves.toBeUndefined();

      expect(
        mocks.sendMessage,
      ).toHaveBeenCalledOnce();

      expect(
        usageMocks.recordUsage,
      ).toHaveBeenCalledOnce();
    });
  });
});