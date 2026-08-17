import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/app';

// Hoisted mock of the server-side Supabase client (service-role). Never contacts network.
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};
  const allCalls: Array<{ table: string; method: string; args: unknown[] }> = [];

  const from = vi.fn((table: string) => {
    let insertData: unknown = null;
    let calledSingle = false;

    function record(method: string, args: unknown[]) {
      allCalls.push({ table, method, args });
    }

    const chain = {
      insert(data: unknown) {
        insertData = data;
        record('insert', [data]);
        return chain;
      },
      select(cols?: unknown, opts?: unknown) {
        record('select', [cols, opts]);
        return chain;
      },
      eq(col: unknown, val: unknown) {
        record('eq', [col, val]);
        return chain;
      },
      single() {
        calledSingle = true;
        record('single', []);
        return Promise.resolve(resolve());
      },
      maybeSingle() {
        calledSingle = true;
        record('maybeSingle', []);
        return Promise.resolve(resolve());
      },
      then(onFulfilled: (value: unknown) => unknown) {
        return Promise.resolve(resolve()).then(onFulfilled);
      },
    };

    function resolve() {
      const cfg = tables[table] ?? {};
      if (insertData !== null) {
        if (cfg.insertError) return { data: null, error: cfg.insertError };
        return { data: cfg.insertResult ?? { id: 'generated-id' }, error: null };
      }
      if (calledSingle) {
        return { data: cfg.single ?? null, error: cfg.singleError ?? null };
      }
      return { data: Array.isArray(cfg.rows) ? cfg.rows : null, error: cfg.listError ?? null };
    }

    return chain;
  });

  return {
    supabaseServer: { from },
    tables,
    getCalls: (table: string, method: string) =>
      allCalls.filter((c) => c.table === table && c.method === method).map((c) => c.args),
    clearCalls: () => {
      allCalls.length = 0;
    },
  };
});

vi.mock('../../server/lib/supabaseClient', () => ({ supabaseServer: m.supabaseServer }));

const TOKEN = '123e4567-e89b-42d3-a456-426614174050';
const LINK_ID = '123e4567-e89b-42d3-a456-426614174020';
const INVOICE_ID = '123e4567-e89b-42d3-a456-426614174010';
const CUSTOMER_ID = '123e4567-e89b-42d3-a456-426614174000';
const ORG_ID = 'org-1';

const LINK_ROW = {
  id: LINK_ID,
  organization_id: ORG_ID,
  invoice_id: INVOICE_ID,
  provider: 'razorpay',
  provider_link_id: 'plink_abc123',
  short_url: 'https://rzp.io/pay/abc123',
  qr_code_url: null,
  amount: 2760,
  currency: 'INR',
  status: 'active',
  expires_at: '2099-12-31T00:00:00Z',
  public_token: TOKEN,
  metadata: {},
  created_at: '2026-08-16T00:00:00Z',
  updated_at: '2026-08-16T00:00:00Z',
};

const INVOICE_ROW = {
  id: INVOICE_ID,
  organization_id: ORG_ID,
  customer_id: CUSTOMER_ID,
  invoice_number: 'INV-2026-001',
  issue_date: '2026-08-01',
  due_date: '2099-12-31',
  currency: 'INR',
  subtotal: 2500,
  tax_total: 360,
  discount: 100,
  total_amount: 2760,
  amount_paid: 0,
  amount_due: 2760,
  status: 'sent',
  pdf_url: null,
  notes: null,
  terms_and_conditions: null,
  is_follow_up_active: true,
  follow_up_paused_until: null,
  last_follow_up_at: null,
  next_follow_up_at: null,
  created_by: 'user-1',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const ORG_ROW = {
  id: ORG_ID,
  name: 'Globex Ltd',
  slug: 'globex',
  logo_url: null,
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  billing_address: null,
  tax_id: null,
  support_email: null,
  support_phone: null,
  created_by: 'user-1',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const CUSTOMER_ROW = {
  id: CUSTOMER_ID,
  organization_id: ORG_ID,
  company_name: 'Globex Ltd',
  contact_name: 'Jane Doe',
  email: 'jane@globex.com',
  phone: '+919876543210',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function stubRazorpayFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/orders')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'order_pub_1', amount: 276000 }) } as Response;
    }
    return { ok: false, status: 404, text: async () => '' } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubRazorpayEnv() {
  vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_live_test_key');
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'test_secret');
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'whsec_test_secret');
}

function resetState() {
  m.tables.payment_links = { single: null, insertError: null, insertResult: null, singleError: null };
  m.tables.invoices = { single: null, singleError: null };
  m.tables.organizations = { single: null, singleError: null };
  m.tables.customers = { single: null, singleError: null };
  m.tables.payments = { single: null, insertError: null, insertResult: null, singleError: null };
}

describe('Public Payment Routes (customer page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.clearCalls();
    resetState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('GET /public/payment-links/:token', () => {
    it('returns 404 for an unknown token', async () => {
      m.tables.payment_links.single = null;
      const res = await request(app).get(`/api/v1/public/payment-links/${TOKEN}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYMENT_LINK_NOT_FOUND');
    });

    it('returns a sanitized payment page without exposing internal ids', async () => {
      m.tables.payment_links.single = LINK_ROW;
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).get(`/api/v1/public/payment-links/${TOKEN}`);
      expect(res.status).toBe(200);

      const page = res.body.data.paymentPage;
      expect(page.businessName).toBe('Globex Ltd');
      expect(page.invoiceNumber).toBe('INV-2026-001');
      expect(page.issueDate).toBe('2026-08-01');
      expect(page.dueDate).toBe('2099-12-31');
      expect(page.totalAmount).toBe(2760);
      expect(page.amountPaid).toBe(0);
      expect(page.amountDue).toBe(2760);
      expect(page.payableAmount).toBe(2760);
      expect(page.invoiceStatus).toBe('sent');
      expect(page.paymentStatus).toBe('open');
      expect(page.paymentLinkUrl).toBe('https://rzp.io/pay/abc123');
      expect(page.customerName).toBe('Jane Doe');
      expect(page.customerEmail).toBe('jane@globex.com');
      expect(page.providerConfigured).toBe(false);

      // Never leak internal ids to the customer.
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('organization_id');
      expect(raw).not.toContain('organizationId');
      expect(raw).not.toContain('org-1');
      expect(raw).not.toContain(LINK_ID);
      expect(raw).not.toContain(INVOICE_ID);
      expect(raw).not.toContain(CUSTOMER_ID);
    });

    it('reports an expired link', async () => {
      m.tables.payment_links.single = { ...LINK_ROW, expires_at: '2020-01-01T00:00:00Z' };
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).get(`/api/v1/public/payment-links/${TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.paymentPage.paymentStatus).toBe('expired');
    });

    it('reports a cancelled link', async () => {
      m.tables.payment_links.single = { ...LINK_ROW, status: 'cancelled' };
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).get(`/api/v1/public/payment-links/${TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.paymentPage.paymentStatus).toBe('cancelled');
    });

    it('reports a fully paid invoice', async () => {
      m.tables.payment_links.single = LINK_ROW;
      m.tables.invoices.single = { ...INVOICE_ROW, status: 'paid', amount_paid: 2760, amount_due: 0 };
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).get(`/api/v1/public/payment-links/${TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.paymentPage.paymentStatus).toBe('paid');
    });

    it('derives payable amount from the stored link amount', async () => {
      m.tables.payment_links.single = { ...LINK_ROW, amount: 1000 };
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).get(`/api/v1/public/payment-links/${TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.paymentPage.payableAmount).toBe(1000);
    });
  });

  describe('POST /public/payment-links/:token/payments', () => {
    it('returns 404 for an unknown token', async () => {
      m.tables.payment_links.single = null;
      const res = await request(app).post(`/api/v1/public/payment-links/${TOKEN}/payments`).send({});
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYMENT_LINK_NOT_FOUND');
    });

    it('creates a real provider order for the server-determined amount', async () => {
      stubRazorpayEnv();
      m.tables.payment_links.single = LINK_ROW;
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;
      const fetchMock = stubRazorpayFetch();

      const res = await request(app).post(`/api/v1/public/payment-links/${TOKEN}/payments`).send({});
      expect(res.status).toBe(201);

      const checkout = res.body.data.checkout;
      expect(checkout.orderId).toBe('order_pub_1');
      expect(checkout.amountPaise).toBe(276000);
      expect(checkout.currency).toBe('INR');
      expect(checkout.businessName).toBe('Globex Ltd');
      expect(checkout.keyId).toBe('rzp_live_test_key');
      expect(checkout.prefill).toEqual({ name: 'Jane Doe', email: 'jane@globex.com' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const inserts = m.getCalls('payments', 'insert');
      expect(inserts).toHaveLength(1);
      expect(inserts[0][0]).toEqual(
        expect.objectContaining({
          organization_id: ORG_ID,
          invoice_id: INVOICE_ID,
          payment_link_id: LINK_ID,
          amount: 2760,
          status: 'pending',
          provider_order_id: 'order_pub_1',
        })
      );

      // No internal ids in the response.
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('organization_id');
      expect(raw).not.toContain('organizationId');
      expect(raw).not.toContain('org-1');
      expect(raw).not.toContain(LINK_ID);
      expect(raw).not.toContain(INVOICE_ID);
    });

    it('ignores a customer-supplied amount (amount is always server-side)', async () => {
      stubRazorpayEnv();
      m.tables.payment_links.single = LINK_ROW;
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;
      const fetchMock = stubRazorpayFetch();

      const res = await request(app)
        .post(`/api/v1/public/payment-links/${TOKEN}/payments`)
        .send({ amount: 1 });

      expect(res.status).toBe(201);
      expect(res.body.data.checkout.amountPaise).toBe(276000);
      const inserts = m.getCalls('payments', 'insert');
      expect(inserts[0][0]).toEqual(expect.objectContaining({ amount: 2760 }));
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/orders'), expect.any(Object));
    });

    it('uses the remaining balance when it is less than the link amount', async () => {
      stubRazorpayEnv();
      stubRazorpayFetch();
      m.tables.payment_links.single = LINK_ROW;
      m.tables.invoices.single = { ...INVOICE_ROW, amount_paid: 1760, amount_due: 1000 };
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).post(`/api/v1/public/payment-links/${TOKEN}/payments`).send({});
      expect(res.status).toBe(201);
      expect(res.body.data.checkout.amountPaise).toBe(100000);
      expect(m.getCalls('payments', 'insert')[0][0]).toEqual(expect.objectContaining({ amount: 1000 }));
    });

    it('reuses an in-flight pending payment instead of creating a duplicate order', async () => {
      stubRazorpayEnv();
      m.tables.payment_links.single = LINK_ROW;
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;
      m.tables.payments.single = {
        id: 'pay-pending-1',
        organization_id: ORG_ID,
        invoice_id: INVOICE_ID,
        payment_link_id: LINK_ID,
        amount: 2760,
        currency: 'INR',
        status: 'pending',
        provider: 'razorpay',
        provider_order_id: 'order_pending_1',
        provider_payment_id: null,
        created_at: '2026-08-16T00:00:00Z',
      };
      const fetchMock = stubRazorpayFetch();

      const res = await request(app).post(`/api/v1/public/payment-links/${TOKEN}/payments`).send({});
      expect(res.status).toBe(201);
      expect(res.body.data.checkout.orderId).toBe('order_pending_1');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(m.getCalls('payments', 'insert')).toHaveLength(0);
    });

    it('returns 409 for an expired link', async () => {
      stubRazorpayEnv();
      m.tables.payment_links.single = { ...LINK_ROW, expires_at: '2020-01-01T00:00:00Z' };
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).post(`/api/v1/public/payment-links/${TOKEN}/payments`).send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_LINK_EXPIRED');
      expect(m.getCalls('payments', 'insert')).toHaveLength(0);
    });

    it('returns 409 for a cancelled link', async () => {
      stubRazorpayEnv();
      m.tables.payment_links.single = { ...LINK_ROW, status: 'cancelled' };
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).post(`/api/v1/public/payment-links/${TOKEN}/payments`).send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_LINK_NOT_ACTIVE');
    });

    it('returns 409 for an already-paid invoice', async () => {
      stubRazorpayEnv();
      m.tables.payment_links.single = LINK_ROW;
      m.tables.invoices.single = { ...INVOICE_ROW, status: 'paid', amount_paid: 2760, amount_due: 0 };
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).post(`/api/v1/public/payment-links/${TOKEN}/payments`).send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVOICE_ALREADY_PAID');
    });

    it('returns 503 and never fakes success when the provider is not configured', async () => {
      m.tables.payment_links.single = LINK_ROW;
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.organizations.single = ORG_ROW;
      m.tables.customers.single = CUSTOMER_ROW;

      const res = await request(app).post(`/api/v1/public/payment-links/${TOKEN}/payments`).send({});
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
      expect(m.getCalls('payments', 'insert')).toHaveLength(0);
    });
  });
});
