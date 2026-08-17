import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../../server/app';

// Hoisted mock of the server-side Supabase client (service-role). Never contacts network.
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};
  const allCalls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpcConfig: Record<string, { result?: string; error?: unknown }> = {};

  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    const cfg = rpcConfig[name] ?? {};
    if (cfg.error) return Promise.resolve({ data: null, error: cfg.error });
    return Promise.resolve({ data: cfg.result ?? 'ok', error: null });
  });

  const from = vi.fn((table: string) => {
    let insertData: unknown = null;
    let updateData: unknown = null;
    let isDelete = false;
    let selectOptions: { count?: string } | null = null;
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
      update(data: unknown) {
        updateData = data;
        record('update', [data]);
        return chain;
      },
      delete() {
        isDelete = true;
        record('delete', []);
        return chain;
      },
      select(cols?: unknown, opts?: { count?: string }) {
        if (opts) selectOptions = opts;
        record('select', [cols, opts]);
        return chain;
      },
      eq(col: unknown, val: unknown) {
        record('eq', [col, val]);
        return chain;
      },
      or(filter: unknown) {
        record('or', [filter]);
        return chain;
      },
      order(col: unknown, opts?: unknown) {
        record('order', [col, opts]);
        return chain;
      },
      range(from: unknown, to: unknown) {
        record('range', [from, to]);
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
      catch(onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(resolve()).catch(onRejected);
      },
      finally(onFinally?: () => void) {
        return Promise.resolve(resolve()).finally(onFinally);
      },
    };

    function resolve() {
      const cfg = tables[table] ?? {};
      if (isDelete) {
        return cfg.deleteError ? { data: null, error: cfg.deleteError } : { data: null, error: null };
      }
      if (insertData !== null) {
        if (cfg.insertError) return { data: null, error: cfg.insertError };
        return { data: cfg.insertResult ?? { id: 'generated-id' }, error: null };
      }
      if (updateData !== null) {
        if (cfg.updateError) return { data: null, error: cfg.updateError };
        return { data: cfg.updateResult ?? null, error: null };
      }
      if (selectOptions?.count === 'exact') {
        const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
        return { data: rows, count: rows.length, error: cfg.listError ?? null };
      }
      if (calledSingle) {
        return { data: cfg.single ?? null, error: cfg.singleError ?? null };
      }
      return { data: Array.isArray(cfg.rows) ? cfg.rows : null, error: cfg.listError ?? null };
    }

    return chain;
  });

  const auth = {
    getUser: vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>(() =>
      Promise.resolve({ data: { user: null }, error: null })
    ),
  };

  return {
    supabaseServer: { auth, from, rpc },
    tables,
    rpcConfig,
    getCalls: (table: string, method: string) =>
      allCalls.filter((c) => c.table === table && c.method === method).map((c) => c.args),
    getRpcCalls: (name: string) => rpcCalls.filter((c) => c.name === name).map((c) => c.args),
    clearCalls: () => {
      allCalls.length = 0;
      rpcCalls.length = 0;
      for (const key of Object.keys(rpcConfig)) delete rpcConfig[key];
    },
  };
});

vi.mock('../../server/lib/supabaseClient', () => ({ supabaseServer: m.supabaseServer }));

const WEBHOOK_SECRET = 'whsec_test_secret';

const USER = { id: 'user-1', email: 'owner@paypilot.test', role: 'authenticated' };

const MEMBERSHIP = {
  id: 'membership-1',
  organization_id: 'org-1',
  user_id: 'user-1',
  role: 'owner',
  status: 'active',
};

const CUSTOMER_ID = '123e4567-e89b-42d3-a456-426614174000';
const INVOICE_ID = '123e4567-e89b-42d3-a456-426614174010';
const LINK_ID = '123e4567-e89b-42d3-a456-426614174020';
const PAYMENT_ID = '123e4567-e89b-42d3-a456-426614174030';
const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174040';

const INVOICE_ROW = {
  id: INVOICE_ID,
  organization_id: 'org-1',
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
  status: 'draft',
  pdf_url: null,
  notes: null,
  terms_and_conditions: null,
  is_follow_up_active: true,
  follow_up_paused_until: null,
  last_follow_up_at: null,
  next_follow_up_at: null,
  created_by: USER.id,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  customer: { id: CUSTOMER_ID, organization_id: 'org-1', company_name: 'Globex Ltd', contact_name: 'Jane Doe', email: 'jane@globex.com' },
  items: [
    {
      id: 'item-1',
      invoice_id: INVOICE_ID,
      description: 'Service',
      quantity: 2,
      unit_price: 1000,
      tax_rate: 18,
      tax_amount: 360,
      total: 2000,
      created_at: '2026-08-01T00:00:00Z',
    },
  ],
};

function pendingPaymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    organization_id: 'org-1',
    invoice_id: INVOICE_ID,
    payment_link_id: null,
    amount: 2760,
    currency: 'INR',
    method: 'upi',
    status: 'pending',
    provider: 'razorpay',
    provider_payment_id: null,
    provider_order_id: 'order_abc123',
    reference_number: null,
    paid_at: '2026-08-16T00:00:00Z',
    notes: null,
    raw_payload: {},
    created_at: '2026-08-16T00:00:00Z',
    ...overrides,
  };
}

function authHeaders(orgId = 'org-1') {
  return { Authorization: 'Bearer valid-token', 'X-Organization-Id': orgId };
}

function resetState() {
  m.tables.invoices = {
    rows: null,
    single: null,
    insertResult: null,
    insertError: null,
    updateError: null,
    deleteError: null,
    listError: null,
  };
  m.tables.organization_members = { single: MEMBERSHIP };
  m.tables.payments = {
    rows: null,
    single: null,
    insertResult: null,
    insertError: null,
    updateError: null,
    deleteError: null,
    listError: null,
  };
  m.tables.payment_links = {
    rows: null,
    single: null,
    insertResult: null,
    insertError: null,
    updateError: null,
    deleteError: null,
    listError: null,
  };
  m.tables.webhook_events = {
    rows: null,
    single: null,
    insertResult: null,
    insertError: null,
    updateError: null,
    deleteError: null,
    listError: null,
  };
}

function stubRazorpayFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/orders')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'order_abc123', amount: 276000 }) } as Response;
    }
    if (url.includes('/payment_links')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'plink_abc123', short_url: 'https://rzp.io/pay/abc123', status: 'created' }),
      } as Response;
    }
    return { ok: false, status: 404, text: async () => '' } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubRazorpayEnv() {
  vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_live_test_key');
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'test_secret');
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', WEBHOOK_SECRET);
}

function signedWebhook(payload: Record<string, unknown>): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  return { body, signature };
}

function capturedPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'payment.captured',
    event_id: 'evt_captured_1',
    payload: {
      payment: {
        entity: {
          id: 'pay_captured_1',
          order_id: 'order_abc123',
          amount: 276000,
          currency: 'INR',
          method: 'card',
          ...overrides,
        },
      },
    },
  };
}

describe('Payment Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.clearCalls();
    resetState();
    vi.mocked(m.supabaseServer.auth.getUser).mockResolvedValue({ data: { user: USER }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('POST /payment-links', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/v1/payment-links').send({ invoiceId: INVOICE_ID });
      expect(res.status).toBe(401);
    });

    it('rejects requests without an org header', async () => {
      const res = await request(app)
        .post('/api/v1/payment-links')
        .set('Authorization', 'Bearer valid-token')
        .send({ invoiceId: INVOICE_ID });
      expect(res.status).toBe(400);
    });

    it('returns 404 for an invoice that does not belong to the organization', async () => {
      m.tables.invoices.single = null;
      const res = await request(app)
        .post('/api/v1/payment-links')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
    });

    it('returns 409 for an already-paid invoice', async () => {
      m.tables.invoices.single = { ...INVOICE_ROW, status: 'paid', amount_due: 0, amount_paid: 2760 };
      const res = await request(app)
        .post('/api/v1/payment-links')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVOICE_ALREADY_PAID');
    });

    it('returns 400 when the requested amount exceeds the invoice balance', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      const res = await request(app)
        .post('/api/v1/payment-links')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID, amount: 9999 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AMOUNT_EXCEEDS_BALANCE');
    });

    it('returns 503 when provider credentials are not configured', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      const res = await request(app)
        .post('/api/v1/payment-links')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
      expect(m.getCalls('payment_links', 'insert')).toHaveLength(0);
    });

    it('creates a payment link for the full balance', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.payment_links.insertResult = {
        id: LINK_ID,
        organization_id: 'org-1',
        invoice_id: INVOICE_ID,
        provider: 'razorpay',
        provider_link_id: 'plink_abc123',
        short_url: 'https://rzp.io/pay/abc123',
        qr_code_url: null,
        amount: 2760,
        currency: 'INR',
        status: 'active',
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        metadata: {},
        created_at: '2026-08-16T00:00:00Z',
        updated_at: '2026-08-16T00:00:00Z',
        invoice: { invoice_number: 'INV-2026-001' },
      };
      stubRazorpayEnv();
      const fetchMock = stubRazorpayFetch();

      const res = await request(app)
        .post('/api/v1/payment-links')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID });

      expect(res.status).toBe(201);
      expect(res.body.data.paymentLink.shortUrl).toBe('https://rzp.io/pay/abc123');
      expect(res.body.data.paymentLink.amount).toBe(2760);
      expect(res.body.data.paymentLink.status).toBe('active');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const insertArgs = m.getCalls('payment_links', 'insert');
      expect(insertArgs).toHaveLength(1);
      expect(insertArgs[0][0]).toEqual(
        expect.objectContaining({ amount: 2760, status: 'active', provider: 'razorpay' })
      );
    });

    it('creates a partial payment link with a validated amount', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.payment_links.insertResult = {
        id: LINK_ID,
        organization_id: 'org-1',
        invoice_id: INVOICE_ID,
        provider: 'razorpay',
        provider_link_id: 'plink_abc123',
        short_url: 'https://rzp.io/pay/abc123',
        amount: 1000,
        currency: 'INR',
        status: 'active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        metadata: {},
        created_at: '2026-08-16T00:00:00Z',
        updated_at: '2026-08-16T00:00:00Z',
        invoice: { invoice_number: 'INV-2026-001' },
      };
      stubRazorpayEnv();
      stubRazorpayFetch();

      const res = await request(app)
        .post('/api/v1/payment-links')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID, amount: 1000, expiresInDays: 1 });

      expect(res.status).toBe(201);
      expect(res.body.data.paymentLink.amount).toBe(1000);
    });
  });

  describe('GET /payment-links/:id', () => {
    it('returns 404 for an unknown payment link', async () => {
      m.tables.payment_links.single = null;
      const res = await request(app).get(`/api/v1/payment-links/${LINK_ID}`).set(authHeaders());
      expect(res.status).toBe(404);
    });

    it('returns the payment link scoped to the organization', async () => {
      m.tables.payment_links.single = {
        id: LINK_ID,
        organization_id: 'org-1',
        invoice_id: INVOICE_ID,
        provider: 'razorpay',
        provider_link_id: 'plink_abc123',
        short_url: 'https://rzp.io/pay/abc123',
        qr_code_url: null,
        amount: 2760,
        currency: 'INR',
        status: 'active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        metadata: {},
        created_at: '2026-08-16T00:00:00Z',
        updated_at: '2026-08-16T00:00:00Z',
        invoice: { invoice_number: 'INV-2026-001' },
      };
      const res = await request(app).get(`/api/v1/payment-links/${LINK_ID}`).set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.data.paymentLink.invoiceNumber).toBe('INV-2026-001');
      expect(res.body.data.paymentLink.status).toBe('active');
    });

    it('reports an expired link with status expired', async () => {
      m.tables.payment_links.single = {
        id: LINK_ID,
        organization_id: 'org-1',
        invoice_id: INVOICE_ID,
        provider: 'razorpay',
        provider_link_id: 'plink_abc123',
        short_url: 'https://rzp.io/pay/abc123',
        amount: 2760,
        currency: 'INR',
        status: 'active',
        expires_at: new Date(Date.now() - 86400000).toISOString(),
        metadata: {},
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
        invoice: { invoice_number: 'INV-2026-001' },
      };
      const res = await request(app).get(`/api/v1/payment-links/${LINK_ID}`).set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.data.paymentLink.status).toBe('expired');
    });
  });

  describe('POST /payments/create', () => {
    it('returns 404 for a cross-tenant invoice', async () => {
      m.tables.invoices.single = null;
      const res = await request(app)
        .post('/api/v1/payments/create')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
    });

    it('returns 400 when the amount exceeds the balance', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      const res = await request(app)
        .post('/api/v1/payments/create')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID, amount: 2760.01 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AMOUNT_EXCEEDS_BALANCE');
      expect(m.getCalls('payments', 'insert')).toHaveLength(0);
    });

    it('returns 503 when provider credentials are not configured (never fakes success)', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      const res = await request(app)
        .post('/api/v1/payments/create')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
      expect(m.getCalls('payments', 'insert')).toHaveLength(0);
    });

    it('creates a pending payment order and returns the public key', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.payments.insertResult = pendingPaymentRow();
      stubRazorpayEnv();
      const fetchMock = stubRazorpayFetch();

      const res = await request(app)
        .post('/api/v1/payments/create')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID });

      expect(res.status).toBe(201);
      expect(res.body.data.payment.status).toBe('pending');
      expect(res.body.data.payment.amount).toBe(2760);
      expect(res.body.data.providerOrderId).toBe('order_abc123');
      expect(res.body.data.amountPaise).toBe(276000);
      expect(res.body.data.keyId).toBe('rzp_live_test_key');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const insertArgs = m.getCalls('payments', 'insert');
      expect(insertArgs).toHaveLength(1);
      expect(insertArgs[0][0]).toEqual(
        expect.objectContaining({
          status: 'pending',
          amount: 2760,
          provider: 'razorpay',
          provider_order_id: 'order_abc123',
        })
      );
    });

    it('deduplicates retries sharing an idempotency key without creating a new provider order', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.payments.single = pendingPaymentRow();
      stubRazorpayEnv();
      const fetchMock = stubRazorpayFetch();

      const res = await request(app)
        .post('/api/v1/payments/create')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID, idempotencyKey: IDEMPOTENCY_KEY });

      expect(res.status).toBe(201);
      expect(res.body.data.payment.id).toBe(PAYMENT_ID);
      expect(res.body.data.providerOrderId).toBe('order_abc123');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(m.getCalls('payments', 'insert')).toHaveLength(0);
    });

    it('creates a partial payment order', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.payments.insertResult = { ...pendingPaymentRow(), amount: 500 };
      stubRazorpayEnv();
      const fetchMock = stubRazorpayFetch();

      const res = await request(app)
        .post('/api/v1/payments/create')
        .set(authHeaders())
        .send({ invoiceId: INVOICE_ID, amount: 500 });

      expect(res.status).toBe(201);
      expect(res.body.data.payment.amount).toBe(500);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /invoices/:id/payments', () => {
    it('returns 404 for an invoice outside the organization', async () => {
      m.tables.invoices.single = null;
      const res = await request(app).get(`/api/v1/invoices/${INVOICE_ID}/payments`).set(authHeaders());
      expect(res.status).toBe(404);
    });

    it('lists payments for an invoice', async () => {
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.payments.rows = [
        pendingPaymentRow({ id: 'pay-1', status: 'successful' }),
        pendingPaymentRow({ id: 'pay-2', status: 'failed' }),
      ];

      const res = await request(app).get(`/api/v1/invoices/${INVOICE_ID}/payments`).set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.data.payments).toHaveLength(2);
      expect(res.body.data.payments[0].status).toBe('successful');
      expect(res.body.data.payments[1].status).toBe('failed');
    });
  });

  describe('POST /webhooks/payment', () => {
    it('returns 503 when webhook handling is not configured', async () => {
      const { body, signature } = signedWebhook(capturedPayload());
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.status).toBe(503);
    });

    it('rejects an invalid signature with 401', async () => {
      stubRazorpayEnv();
      const { body } = signedWebhook(capturedPayload());
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', 'deadbeef')
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
      expect(m.getCalls('webhook_events', 'insert')).toHaveLength(0);
    });

    it('confirms a captured payment transaction-safely via the confirm_payment_capture RPC', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = pendingPaymentRow();
      m.rpcConfig.confirm_payment_capture = { result: 'confirmed' };

      const { body, signature } = signedWebhook(capturedPayload());
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.data.handled).toBe(true);

      const rpcArgs = m.getRpcCalls('confirm_payment_capture');
      expect(rpcArgs).toHaveLength(1);
      expect(rpcArgs[0]).toEqual(
        expect.objectContaining({
          p_payment_id: PAYMENT_ID,
          p_provider_payment_id: 'pay_captured_1',
          p_method: 'card',
        })
      );

      // Reconciliation (amount_paid/amount_due/status) happens inside the RPC,
      // never via unguarded service-role table updates.
      expect(m.getCalls('payments', 'update')).toHaveLength(0);
      expect(m.getCalls('invoices', 'update')).toHaveLength(0);

      // The event is logged idempotently for audit + replay detection.
      const eventInserts = m.getCalls('webhook_events', 'insert');
      expect(eventInserts).toHaveLength(1);
      expect(eventInserts[0][0]).toEqual(
        expect.objectContaining({
          provider: 'razorpay',
          provider_event_id: 'evt_captured_1',
          is_processed: true,
          organization_id: 'org-1',
        })
      );
    });

    it('skips a replayed event id without double-crediting (unique(provider, provider_event_id))', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = pendingPaymentRow();
      m.rpcConfig.confirm_payment_capture = { result: 'duplicate' };
      m.tables.webhook_events.insertError = { code: '23505' };

      const { body, signature } = signedWebhook(capturedPayload());
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      expect(m.getCalls('webhook_events', 'insert')).toHaveLength(1);
      expect(m.getCalls('payments', 'update')).toHaveLength(0);
      expect(m.getCalls('invoices', 'update')).toHaveLength(0);
    });

    it('ignores a repeated capture event for an already-successful payment (RPC idempotency)', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = pendingPaymentRow({ status: 'successful' });
      m.rpcConfig.confirm_payment_capture = { result: 'duplicate' };

      const payload = capturedPayload({ event_id: 'evt_captured_2', id: 'pay_captured_2' });
      const { body, signature } = signedWebhook(payload);
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      expect(m.getRpcCalls('confirm_payment_capture')).toHaveLength(1);
      expect(m.getCalls('payments', 'update')).toHaveLength(0);
      expect(m.getCalls('invoices', 'update')).toHaveLength(0);
      expect(m.getCalls('webhook_events', 'insert')).toHaveLength(1);
    });

    it('dispatches a partial payment to the RPC with the server-side payment id', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = pendingPaymentRow({ amount: 1000 });
      m.rpcConfig.confirm_payment_capture = { result: 'confirmed' };

      const payload = capturedPayload({ event_id: 'evt_captured_partial', amount: 100000, id: 'pay_partial_1' });
      const { body, signature } = signedWebhook(payload);
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      const rpcArgs = m.getRpcCalls('confirm_payment_capture');
      expect(rpcArgs).toHaveLength(1);
      expect(rpcArgs[0]).toEqual(expect.objectContaining({ p_payment_id: PAYMENT_ID }));
    });

    it('records events with no matching payment without side effects', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = null;

      const { body, signature } = signedWebhook(capturedPayload());
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      const eventInserts = m.getCalls('webhook_events', 'insert');
      expect(eventInserts).toHaveLength(1);
      expect(eventInserts[0][0]).toEqual(expect.objectContaining({ error_message: 'No matching payment found.' }));
      expect(m.getRpcCalls('confirm_payment_capture')).toHaveLength(0);
    });

    it('marks a payment initiated event as processing via the RPC', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = pendingPaymentRow();
      m.rpcConfig.mark_payment_processing = { result: 'processing' };

      const payload = {
        event: 'payment.initiated',
        event_id: 'evt_init_1',
        payload: {
          order: {
            entity: {
              id: 'order_abc123',
              amount: 276000,
              currency: 'INR',
              payments: [{ payment: { entity: { id: 'pay_init_1', order_id: 'order_abc123' } } }],
            },
          },
        },
      };
      const { body, signature } = signedWebhook(payload);
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      const rpcArgs = m.getRpcCalls('mark_payment_processing');
      expect(rpcArgs).toHaveLength(1);
      expect(rpcArgs[0]).toEqual(expect.objectContaining({ p_payment_id: PAYMENT_ID }));
      expect(m.getCalls('invoices', 'update')).toHaveLength(0);
    });

    it('marks a failed payment via the RPC without touching the invoice', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = pendingPaymentRow();
      m.rpcConfig.mark_payment_failed = { result: 'failed' };

      const payload = {
        event: 'payment.failed',
        event_id: 'evt_failed_1',
        payload: {
          payment: {
            entity: { id: 'pay_failed_1', order_id: 'order_abc123', amount: 276000, currency: 'INR', method: 'upi' },
          },
        },
      };
      const { body, signature } = signedWebhook(payload);
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      const rpcArgs = m.getRpcCalls('mark_payment_failed');
      expect(rpcArgs).toHaveLength(1);
      expect(rpcArgs[0]).toEqual(
        expect.objectContaining({ p_payment_id: PAYMENT_ID, p_provider_payment_id: 'pay_failed_1' })
      );
      expect(m.getCalls('invoices', 'update')).toHaveLength(0);
    });

    it('marks a refunded payment via the RPC', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = pendingPaymentRow({ status: 'successful' });
      m.rpcConfig.mark_payment_refunded = { result: 'refunded' };

      const payload = {
        event: 'refund.processed',
        event_id: 'evt_refund_1',
        payload: {
          refund: {
            entity: { id: 'rfnd_1', payment_id: 'pay_captured_1', amount: 276000, currency: 'INR' },
          },
        },
      };
      const { body, signature } = signedWebhook(payload);
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      const rpcArgs = m.getRpcCalls('mark_payment_refunded');
      expect(rpcArgs).toHaveLength(1);
      expect(rpcArgs[0]).toEqual(expect.objectContaining({ p_payment_id: PAYMENT_ID }));
    });

    it('confirms payments for payment_link.paid events via the RPC', async () => {
      stubRazorpayEnv();
      m.tables.payments.single = pendingPaymentRow();
      m.rpcConfig.confirm_payment_capture = { result: 'confirmed' };

      const payload = {
        event: 'payment_link.paid',
        event_id: 'evt_link_paid_1',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_abc123',
              amount: 276000,
              currency: 'INR',
              payments: [{ payment: { entity: { id: 'pay_link_1', order_id: 'order_abc123' } } }],
            },
          },
        },
      };
      const { body, signature } = signedWebhook(payload);
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      const rpcArgs = m.getRpcCalls('confirm_payment_capture');
      expect(rpcArgs).toHaveLength(1);
      expect(rpcArgs[0]).toEqual(expect.objectContaining({ p_payment_id: PAYMENT_ID }));
    });

    it('records unknown events without applying them', async () => {
      stubRazorpayEnv();
      const payload = { event: 'some.unknown.event', event_id: 'evt_unknown_1', payload: {} };
      const { body, signature } = signedWebhook(payload);
      const res = await request(app)
        .post('/api/v1/webhooks/payment')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);
      expect(m.getCalls('webhook_events', 'insert')).toHaveLength(1);
      expect(m.getRpcCalls('confirm_payment_capture')).toHaveLength(0);
      expect(m.getCalls('payments', 'update')).toHaveLength(0);
      expect(m.getCalls('invoices', 'update')).toHaveLength(0);
    });
  });
});
