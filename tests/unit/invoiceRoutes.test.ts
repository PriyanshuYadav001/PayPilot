import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/app';

// Hoisted mock of the server-side Supabase client (service-role). Never contacts network.
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};
  const allCalls: Array<{ table: string; method: string; args: unknown[] }> = [];

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
      gte(col: unknown, val: unknown) {
  record('gte', [col, val]);
  return chain;
},
lt(col: unknown, val: unknown) {
  record('lt', [col, val]);
  return chain;
},

ilike(col: unknown, pattern: unknown) {
  record('ilike', [col, pattern]);
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
    supabaseServer: { auth, from },
    tables,
    getCalls: (table: string, method: string) =>
      allCalls.filter((c) => c.table === table && c.method === method).map((c) => c.args),
    clearCalls: () => {
      allCalls.length = 0;
    },
  };
});

vi.mock('../../server/lib/supabaseClient', () => ({ supabaseServer: m.supabaseServer }));

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
const OTHER_INVOICE_ID = '123e4567-e89b-42d3-a456-426614174011';

const CUSTOMER_ROW = {
  id: CUSTOMER_ID,
  organization_id: 'org-1',
  company_name: 'Globex Ltd',
  contact_name: 'Jane Doe',
  email: 'jane@globex.com',
};

// Row matching the CREATE_FINANCIAL_PAYLOAD: 2 items (2x1000 @18% + 1x500 @0%), discount 100.
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
  customer: { ...CUSTOMER_ROW },
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
    {
      id: 'item-2',
      invoice_id: INVOICE_ID,
      description: 'Setup',
      quantity: 1,
      unit_price: 500,
      tax_rate: 0,
      tax_amount: 0,
      total: 500,
      created_at: '2026-08-01T00:00:00Z',
    },
  ],
};

const INVOICE_ROW_2 = {
  ...INVOICE_ROW,
  id: OTHER_INVOICE_ID,
  invoice_number: 'INV-2026-002',
  customer: { ...CUSTOMER_ROW, id: CUSTOMER_ID },
};

const CREATE_FINANCIAL_PAYLOAD = {
  customerId: CUSTOMER_ID,
  invoiceNumber: 'INV-2026-001',
  issueDate: '2026-08-01',
  dueDate: '2099-12-31',
  currency: 'INR',
  discount: 100,
  items: [
    { description: 'Service', quantity: 2, unitPrice: 1000, taxRate: 18 },
    { description: 'Setup', quantity: 1, unitPrice: 500, taxRate: 0 },
  ],
};

function authHeaders(orgId = 'org-1') {
  return { Authorization: 'Bearer valid-token', 'X-Organization-Id': orgId };
}

function calledWithTable(table: string): boolean {
  return m.supabaseServer.from.mock.calls.some((call) => call[0] === table);
}

function resetTables() {
  m.tables.customers = {
    rows: null,
    single: null,
    insertError: null,
    insertResult: null,
    updateError: null,
    updateResult: null,
    deleteError: null,
    listError: null,
  };
  m.tables.invoices = {
    rows: null,
    single: null,
    insertError: null,
    insertResult: null,
    updateError: null,
    updateResult: null,
    deleteError: null,
    listError: null,
  };
  m.tables.invoice_items = {
    rows: null,
    single: null,
    insertError: null,
    insertResult: null,
    updateError: null,
    updateResult: null,
    deleteError: null,
    listError: null,
  };
  m.tables.usage_records = {
  rows: [],
  single: null,
  insertError: null,
  insertResult: null,
  updateError: null,
  updateResult: null,
  deleteError: null,
  listError: null,
};
  m.tables.organization_members = { single: MEMBERSHIP };
    m.tables.usage_records = {
    rows: [],
    single: null,
    insertError: null,
    insertResult: null,
    updateError: null,
    updateResult: null,
    deleteError: null,
    listError: null,
  };
}

describe('Invoice Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.clearCalls();
    resetTables();
    vi.mocked(m.supabaseServer.auth.getUser).mockResolvedValue({ data: { user: USER }, error: null });
  });

  it('GET /invoices rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/invoices');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(calledWithTable('invoices')).toBe(false);
  });

  it('GET /invoices rejects requests without an organization header', async () => {
    const res = await request(app).get('/api/v1/invoices').set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(calledWithTable('invoices')).toBe(false);
  });

  it('GET /invoices lists invoices for the organization with pagination', async () => {
    m.tables.invoices.rows = [INVOICE_ROW, INVOICE_ROW_2];

    const res = await request(app).get('/api/v1/invoices').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoices).toHaveLength(2);
    expect(res.body.data.invoices[0].invoiceNumber).toBe('INV-2026-001');
    expect(res.body.data.invoices[0].customer?.companyName).toBe('Globex Ltd');
    expect(res.body.data.invoices[0].totalAmount).toBe(2760);
    expect(res.body.data.invoices[0].status).toBe('draft');
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, totalCount: 2, totalPages: 1 });

    const selectCalls = m.getCalls('invoices', 'select');
    expect((selectCalls[0][1] as { count?: string }).count).toBe('exact');
    expect(m.getCalls('invoices', 'eq').some((a) => a[0] === 'organization_id' && a[1] === 'org-1')).toBe(true);
    expect(m.getCalls('invoices', 'range')[0]).toEqual([0, 19]);
  });

  it('GET /invoices applies search, status, and customer filters from the query', async () => {
    m.tables.invoices.rows = [INVOICE_ROW];

    const res = await request(app)
      .get(`/api/v1/invoices?search=INV-2026&status=sent&customerId=${CUSTOMER_ID}&page=2&limit=5`)
      .set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, limit: 5, totalCount: 1, totalPages: 1 });

    const orCall = m.getCalls('invoices', 'or');
    expect(orCall).toHaveLength(1);
    expect(String(orCall[0][0])).toContain('invoice_number.ilike.%INV-2026%');
    expect(m.getCalls('invoices', 'eq').some((a) => a[0] === 'status' && a[1] === 'sent')).toBe(true);
    expect(m.getCalls('invoices', 'eq').some((a) => a[0] === 'customer_id' && a[1] === CUSTOMER_ID)).toBe(true);
  });

  it('POST /invoices computes financials server-side and stores line items', async () => {
    m.tables.customers.single = CUSTOMER_ROW;
    m.tables.invoices.insertResult = { id: INVOICE_ID };
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app).post('/api/v1/invoices').set(authHeaders()).send(CREATE_FINANCIAL_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.data.invoice.invoiceNumber).toBe('INV-2026-001');
    expect(res.body.data.invoice.subtotal).toBe(2500);
    expect(res.body.data.invoice.taxTotal).toBe(360);
    expect(res.body.data.invoice.discount).toBe(100);
    expect(res.body.data.invoice.totalAmount).toBe(2760);
    expect(res.body.data.invoice.amountPaid).toBe(0);
    expect(res.body.data.invoice.amountDue).toBe(2760);
    expect(res.body.data.invoice.status).toBe('draft');

    const insertCalls = m.getCalls('invoices', 'insert');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0]).toEqual(
      expect.objectContaining({
        organization_id: 'org-1',
        customer_id: CUSTOMER_ID,
        invoice_number: 'INV-2026-001',
        subtotal: 2500,
        tax_total: 360,
        discount: 100,
        total_amount: 2760,
        amount_paid: 0,
        amount_due: 2760,
        status: 'draft',
        created_by: 'user-1',
      })
    );

    const itemInsertCalls = m.getCalls('invoice_items', 'insert');
    expect(itemInsertCalls).toHaveLength(1);
    expect(itemInsertCalls[0][0]).toEqual([
      {
        invoice_id: INVOICE_ID,
        description: 'Service',
        quantity: 2,
        unit_price: 1000,
        tax_rate: 18,
        tax_amount: 360,
        total: 2000,
      },
      {
        invoice_id: INVOICE_ID,
        description: 'Setup',
        quantity: 1,
        unit_price: 500,
        tax_rate: 0,
        tax_amount: 0,
        total: 500,
      },
    ]);
  });

  it('POST /invoices rounds line items and tax correctly', async () => {
    m.tables.customers.single = CUSTOMER_ROW;
    m.tables.invoices.insertResult = { id: INVOICE_ID };
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app)
      .post('/api/v1/invoices')
      .set(authHeaders())
      .send({
        customerId: CUSTOMER_ID,
        invoiceNumber: 'INV-ROUND-1',
        issueDate: '2026-08-01',
        dueDate: '2099-12-31',
        items: [{ description: 'Consulting', quantity: 3, unitPrice: 100.333, taxRate: 15 }],
      });

    expect(res.status).toBe(201);
    const insertCall = m.getCalls('invoices', 'insert')[0][0] as Record<string, unknown>;
    expect(insertCall.subtotal).toBe(301);
    expect(insertCall.tax_total).toBe(45.15);
    expect(insertCall.discount).toBe(0);
    expect(insertCall.total_amount).toBe(346.15);
    expect(insertCall.amount_due).toBe(346.15);
  });

  it('POST /invoices accepts an explicit sent status', async () => {
    m.tables.customers.single = CUSTOMER_ROW;
    m.tables.invoices.insertResult = { id: INVOICE_ID };
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app)
      .post('/api/v1/invoices')
      .set(authHeaders())
      .send({ ...CREATE_FINANCIAL_PAYLOAD, status: 'sent' });

    expect(res.status).toBe(201);
    const insertCall = m.getCalls('invoices', 'insert')[0][0] as Record<string, unknown>;
    expect(insertCall.status).toBe('sent');
  });

  it('POST /invoices rejects invalid payloads', async () => {
    const res = await request(app)
      .post('/api/v1/invoices')
      .set(authHeaders())
      .send({ customerId: CUSTOMER_ID, invoiceNumber: 'INV-X', items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calledWithTable('invoices')).toBe(false);
  });

  it('POST /invoices rejects a negative discount', async () => {
    const res = await request(app)
      .post('/api/v1/invoices')
      .set(authHeaders())
      .send({ ...CREATE_FINANCIAL_PAYLOAD, discount: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /invoices rejects a discount exceeding the total', async () => {
    m.tables.customers.single = CUSTOMER_ROW;

    const res = await request(app)
      .post('/api/v1/invoices')
      .set(authHeaders())
      .send({ ...CREATE_FINANCIAL_PAYLOAD, discount: 5000 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DISCOUNT');
  });

  it('POST /invoices returns 404-equivalent when the customer is outside the organization', async () => {
    m.tables.customers.single = null;

    const res = await request(app).post('/api/v1/invoices').set(authHeaders()).send(CREATE_FINANCIAL_PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    expect(m.getCalls('invoices', 'insert')).toHaveLength(0);
  });

  it('POST /invoices returns 409 for a duplicate invoice number', async () => {
    m.tables.customers.single = CUSTOMER_ROW;
    m.tables.invoices.insertError = { code: '23505', message: 'duplicate key value' };

    const res = await request(app).post('/api/v1/invoices').set(authHeaders()).send(CREATE_FINANCIAL_PAYLOAD);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('GET /invoices/:id returns an invoice with items and customer', async () => {
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app).get(`/api/v1/invoices/${INVOICE_ID}`).set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.invoice.id).toBe(INVOICE_ID);
    expect(res.body.data.invoice.invoiceNumber).toBe('INV-2026-001');
    expect(res.body.data.invoice.customer?.companyName).toBe('Globex Ltd');
    expect(res.body.data.invoice.items).toHaveLength(2);
    expect(res.body.data.invoice.items[0].taxAmount).toBe(360);
    expect(res.body.data.invoice.items[0].total).toBe(2000);
  });

  it('GET /invoices/:id returns 404 for invoices outside the organization (IDOR)', async () => {
    m.tables.invoices.single = null;

    const res = await request(app).get(`/api/v1/invoices/${INVOICE_ID}`).set(authHeaders());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /invoices/:id rejects invalid UUIDs', async () => {
    const res = await request(app).get('/api/v1/invoices/not-a-uuid').set(authHeaders());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calledWithTable('invoices')).toBe(false);
  });

  it('PATCH /invoices/:id recomputes totals when items and discount change', async () => {
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app)
      .patch(`/api/v1/invoices/${INVOICE_ID}`)
      .set(authHeaders())
      .send({
        items: [{ description: 'Consulting', quantity: 5, unitPrice: 2000, taxRate: 10 }],
        discount: 50,
      });

    expect(res.status).toBe(200);

    const updateCall = m.getCalls('invoices', 'update')[0][0] as Record<string, unknown>;
    expect(updateCall).toEqual(
      expect.objectContaining({
        subtotal: 10000,
        tax_total: 1000,
        discount: 50,
        total_amount: 10950,
        amount_paid: 0,
        amount_due: 10950,
        status: 'draft',
      })
    );
    expect(m.getCalls('invoices', 'update')[0][0]).not.toHaveProperty('invoice_number');

    const itemDeleteCalls = m.getCalls('invoice_items', 'delete');
    expect(itemDeleteCalls).toHaveLength(1);
    expect(m.getCalls('invoice_items', 'eq').some((a) => a[0] === 'invoice_id' && a[1] === INVOICE_ID)).toBe(true);

    const itemInsertCalls = m.getCalls('invoice_items', 'insert');
    expect(itemInsertCalls).toHaveLength(1);
    expect(itemInsertCalls[0][0]).toEqual([
      {
        invoice_id: INVOICE_ID,
        description: 'Consulting',
        quantity: 5,
        unit_price: 2000,
        tax_rate: 10,
        tax_amount: 1000,
        total: 10000,
      },
    ]);
  });

  it('PATCH /invoices/:id honors a paid status by settling the balance', async () => {
    m.tables.invoices.single = {
      ...INVOICE_ROW,
      subtotal: 1000,
      tax_total: 0,
      discount: 100,
      total_amount: 900,
      amount_paid: 0,
      amount_due: 900,
      status: 'sent',
      items: [
        {
          id: 'item-1',
          invoice_id: INVOICE_ID,
          description: 'Retainer',
          quantity: 1,
          unit_price: 1000,
          tax_rate: 0,
          tax_amount: 0,
          total: 1000,
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
    };

    const res = await request(app)
      .patch(`/api/v1/invoices/${INVOICE_ID}`)
      .set(authHeaders())
      .send({ status: 'paid' });

    expect(res.status).toBe(200);
    const updateCall = m.getCalls('invoices', 'update')[0][0] as Record<string, unknown>;
    expect(updateCall).toEqual(
      expect.objectContaining({
        status: 'paid',
        total_amount: 900,
        amount_paid: 900,
        amount_due: 0,
      })
    );
  });

  it('PATCH /invoices/:id marks a partial payment as partially_paid', async () => {
    m.tables.invoices.single = {
      ...INVOICE_ROW,
      subtotal: 1000,
      tax_total: 0,
      discount: 100,
      total_amount: 900,
      amount_paid: 0,
      amount_due: 900,
      status: 'sent',
      items: [
        {
          id: 'item-1',
          invoice_id: INVOICE_ID,
          description: 'Retainer',
          quantity: 1,
          unit_price: 1000,
          tax_rate: 0,
          tax_amount: 0,
          total: 1000,
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
    };

    const res = await request(app)
      .patch(`/api/v1/invoices/${INVOICE_ID}`)
      .set(authHeaders())
      .send({ amountPaid: 400 });

    expect(res.status).toBe(200);
    const updateCall = m.getCalls('invoices', 'update')[0][0] as Record<string, unknown>;
    expect(updateCall).toEqual(
      expect.objectContaining({
        status: 'partially_paid',
        amount_paid: 400,
        amount_due: 500,
      })
    );
  });

  it('PATCH /invoices/:id derives an overdue status from a past due date', async () => {
    m.tables.invoices.single = {
      ...INVOICE_ROW,
      subtotal: 1000,
      tax_total: 0,
      discount: 100,
      total_amount: 900,
      amount_paid: 0,
      amount_due: 900,
      status: 'sent',
      items: [
        {
          id: 'item-1',
          invoice_id: INVOICE_ID,
          description: 'Retainer',
          quantity: 1,
          unit_price: 1000,
          tax_rate: 0,
          tax_amount: 0,
          total: 1000,
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
    };

    const res = await request(app)
      .patch(`/api/v1/invoices/${INVOICE_ID}`)
      .set(authHeaders())
      .send({ dueDate: '2020-01-01' });

    expect(res.status).toBe(200);
    const updateCall = m.getCalls('invoices', 'update')[0][0] as Record<string, unknown>;
    expect(updateCall).toEqual(
      expect.objectContaining({
        status: 'overdue',
        amount_due: 900,
      })
    );
  });

  it('PATCH /invoices/:id returns 404 for invoices outside the organization (IDOR)', async () => {
    m.tables.invoices.single = null;

    const res = await request(app)
      .patch(`/api/v1/invoices/${INVOICE_ID}`)
      .set(authHeaders())
      .send({ notes: 'changed' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(m.getCalls('invoices', 'update')).toHaveLength(0);
  });

  it('PATCH /invoices/:id rejects an empty update payload', async () => {
    const res = await request(app).patch(`/api/v1/invoices/${INVOICE_ID}`).set(authHeaders()).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calledWithTable('invoices')).toBe(false);
  });

  it('DELETE /invoices/:id deletes an invoice within the organization', async () => {
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app).delete(`/api/v1/invoices/${INVOICE_ID}`).set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.invoice.id).toBe(INVOICE_ID);

    const deleteCalls = m.getCalls('invoices', 'delete');
    expect(deleteCalls).toHaveLength(1);
    expect(m.getCalls('invoices', 'eq').some((a) => a[0] === 'id' && a[1] === INVOICE_ID)).toBe(true);
  });

  it('DELETE /invoices/:id returns 404 for invoices outside the organization (IDOR)', async () => {
    m.tables.invoices.single = null;

    const res = await request(app).delete(`/api/v1/invoices/${INVOICE_ID}`).set(authHeaders());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(m.getCalls('invoices', 'delete')).toHaveLength(0);
  });

  it('POST /invoices is forbidden for viewer role', async () => {
    m.tables.organization_members = { single: { ...MEMBERSHIP, role: 'viewer' } };

    const res = await request(app).post('/api/v1/invoices').set(authHeaders()).send(CREATE_FINANCIAL_PAYLOAD);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(calledWithTable('invoices')).toBe(false);
  });
});
