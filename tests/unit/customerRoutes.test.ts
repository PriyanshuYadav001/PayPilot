import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/app';

// Hoisted mock of the server-side Supabase client (service-role). Never contacts network.
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};
  let lastCustomerChain: Array<[string, unknown[]]> = [];

  const from = vi.fn((table: string) => {
    let insertData: unknown = null;
    let updateData: unknown = null;
    let isDelete = false;
    let selectOptions: { count?: string } | null = null;
    let calledSingle = false;

    const chainCalls: Array<[string, unknown[]]> = [];
    if (table === 'customers') {
      lastCustomerChain = chainCalls;
    }

    function record(method: string, args: unknown[]) {
      chainCalls.push([method, args]);
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
        return cfg.deleteError
          ? { data: null, error: cfg.deleteError }
          : { data: null, error: null };
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
    getLastCustomerChain: () => lastCustomerChain,
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
const OTHER_CUSTOMER_ID = '123e4567-e89b-42d3-a456-426614174001';

const CUSTOMER_ROW = {
  id: CUSTOMER_ID,
  organization_id: 'org-1',
  company_name: 'Globex Ltd',
  contact_name: 'Jane Doe',
  email: 'jane@globex.com',
  phone: '+91 98765 43210',
  whatsapp_number: null,
  gstin: null,
  billing_address: {},
  credit_period_days: 45,
  is_dnd: false,
  notes: null,
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const CUSTOMER_ROW_2 = {
  ...CUSTOMER_ROW,
  id: OTHER_CUSTOMER_ID,
  company_name: 'Initech',
  contact_name: 'Bob Smith',
  email: 'bob@initech.com',
};

const CREATE_PAYLOAD = {
  companyName: 'Globex Ltd',
  contactName: 'Jane Doe',
  email: 'jane@globex.com',
  phone: '+91 98765 43210',
  creditPeriodDays: 45,
  notes: 'Net 45 terms',
};

function authHeaders(orgId = 'org-1') {
  return { Authorization: 'Bearer valid-token', 'X-Organization-Id': orgId };
}

function calledWithCustomers(): boolean {
  return m.supabaseServer.from.mock.calls.some((call) => call[0] === 'customers');
}

describe('Customer Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    m.tables.organization_members = { single: MEMBERSHIP };
    vi.mocked(m.supabaseServer.auth.getUser).mockResolvedValue({ data: { user: USER }, error: null });
  });

  it('GET /customers rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/customers');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(calledWithCustomers()).toBe(false);
  });

  it('GET /customers rejects requests without an organization header', async () => {
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(calledWithCustomers()).toBe(false);
  });

  it('GET /customers lists customers for the organization with pagination', async () => {
    m.tables.customers.rows = [CUSTOMER_ROW, CUSTOMER_ROW_2];

    const res = await request(app).get('/api/v1/customers').set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customers).toHaveLength(2);
    expect(res.body.data.customers[0].companyName).toBe('Globex Ltd');
    expect(res.body.data.customers[0].id).toBe(CUSTOMER_ID);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      totalCount: 2,
      totalPages: 1,
    });

    const chain = m.getLastCustomerChain();
    const selectCount = chain.find(([method]) => method === 'select')?.[1]?.[1] as
      | { count?: string }
      | undefined;
    expect(selectCount?.count).toBe('exact');
    expect(chain.some(([m, a]) => m === 'eq' && a[0] === 'organization_id' && a[1] === 'org-1')).toBe(true);
    expect(chain.some(([m, a]) => m === 'range' && a[0] === 0 && a[1] === 19)).toBe(true);
  });

  it('GET /customers applies search and DND filters from the query', async () => {
    m.tables.customers.rows = [CUSTOMER_ROW];

    const res = await request(app)
      .get('/api/v1/customers?search=globex&isDnd=true&page=2&limit=5')
      .set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 5,
      totalCount: 1,
      totalPages: 1,
    });

    const chain = m.getLastCustomerChain();
    const orCall = chain.find(([m]) => m === 'or');
    expect(orCall).toBeDefined();
    expect(String(orCall![1][0])).toContain('company_name.ilike.%globex%');
    expect(chain.some(([m, a]) => m === 'eq' && a[0] === 'is_dnd' && a[1] === true)).toBe(true);
  });

  it('POST /customers creates a customer scoped to the organization', async () => {
    m.tables.customers.insertResult = CUSTOMER_ROW;

    const res = await request(app).post('/api/v1/customers').set(authHeaders()).send(CREATE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.data.customer.companyName).toBe('Globex Ltd');
    expect(res.body.data.customer.creditPeriodDays).toBe(45);

    const chain = m.getLastCustomerChain();
    const insertCall = chain.find(([m]) => m === 'insert');
    expect(insertCall).toBeDefined();
    expect(insertCall![1][0]).toEqual(
      expect.objectContaining({
        company_name: 'Globex Ltd',
        contact_name: 'Jane Doe',
        email: 'jane@globex.com',
        credit_period_days: 45,
        organization_id: 'org-1',
      })
    );
    expect(chain.some(([m]) => m === 'single')).toBe(true);
  });

  it('POST /customers rejects invalid payloads', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .set(authHeaders())
      .send({ companyName: '', contactName: '', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calledWithCustomers()).toBe(false);
  });

  it('POST /customers returns 409 for a duplicate email', async () => {
    m.tables.customers.insertError = { code: '23505', message: 'duplicate key value' };

    const res = await request(app).post('/api/v1/customers').set(authHeaders()).send(CREATE_PAYLOAD);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('GET /customers/:id returns a single customer', async () => {
    m.tables.customers.single = CUSTOMER_ROW;

    const res = await request(app).get(`/api/v1/customers/${CUSTOMER_ID}`).set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.customer.id).toBe(CUSTOMER_ID);
    expect(res.body.data.customer.companyName).toBe('Globex Ltd');
    expect(res.body.data.customer.contactName).toBe('Jane Doe');
  });

  it('GET /customers/:id returns 404 for customers outside the organization (IDOR)', async () => {
    m.tables.customers.single = null;

    const res = await request(app).get(`/api/v1/customers/${CUSTOMER_ID}`).set(authHeaders());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /customers/:id rejects invalid UUIDs', async () => {
    const res = await request(app).get('/api/v1/customers/not-a-uuid').set(authHeaders());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calledWithCustomers()).toBe(false);
  });

  it('PATCH /customers/:id updates an existing customer', async () => {
    m.tables.customers.single = CUSTOMER_ROW;
    m.tables.customers.updateResult = { ...CUSTOMER_ROW, contact_name: 'John Smith' };

    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set(authHeaders())
      .send({ contactName: 'John Smith' });

    expect(res.status).toBe(200);
    expect(res.body.data.customer.contactName).toBe('John Smith');

    const chain = m.getLastCustomerChain();
    const updateCall = chain.find(([m]) => m === 'update');
    expect(updateCall).toBeDefined();
    expect(updateCall![1][0]).toEqual({ contact_name: 'John Smith' });
    expect(chain.some(([m, a]) => m === 'eq' && a[0] === 'organization_id' && a[1] === 'org-1')).toBe(true);
    expect(chain.some(([m, a]) => m === 'eq' && a[0] === 'id' && a[1] === CUSTOMER_ID)).toBe(true);
  });

  it('PATCH /customers/:id returns 404 for customers outside the organization (IDOR)', async () => {
    m.tables.customers.single = null;

    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}`)
      .set(authHeaders())
      .send({ contactName: 'John Smith' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    const chain = m.getLastCustomerChain();
    expect(chain.some(([m]) => m === 'update')).toBe(false);
  });

  it('PATCH /customers/:id rejects an empty update payload', async () => {
    const res = await request(app).patch(`/api/v1/customers/${CUSTOMER_ID}`).set(authHeaders()).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /customers/:id deletes a customer within the organization', async () => {
    m.tables.customers.single = CUSTOMER_ROW;

    const res = await request(app).delete(`/api/v1/customers/${CUSTOMER_ID}`).set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.customer.id).toBe(CUSTOMER_ID);

    const chain = m.getLastCustomerChain();
    expect(chain.some(([m]) => m === 'delete')).toBe(true);
    expect(chain.some(([m, a]) => m === 'eq' && a[0] === 'id' && a[1] === CUSTOMER_ID)).toBe(true);
  });

  it('DELETE /customers/:id returns 404 for customers outside the organization (IDOR)', async () => {
    m.tables.customers.single = null;

    const res = await request(app).delete(`/api/v1/customers/${CUSTOMER_ID}`).set(authHeaders());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /customers is forbidden for viewer role', async () => {
    m.tables.organization_members = {
      single: { ...MEMBERSHIP, role: 'viewer' },
    };

    const res = await request(app).post('/api/v1/customers').set(authHeaders()).send(CREATE_PAYLOAD);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(calledWithCustomers()).toBe(false);
  });
});
