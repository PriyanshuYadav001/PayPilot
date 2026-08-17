import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/app';
import { MAX_FILE_SIZE } from '../../server/middleware/upload';

// Hoisted mock of the server-side Supabase client (service-role), including the
// storage API. Never contacts network.
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};
  const allCalls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const storageCalls: Array<{ bucket: string; method: string; args: unknown[] }> = [];
  const storageConfigs: Record<string, Record<string, unknown>> = {};

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

  const storageFrom = vi.fn((bucket: string) => {
    function record(method: string, args: unknown[]) {
      storageCalls.push({ bucket, method, args });
    }

    return {
      list(path: unknown, options?: unknown) {
        record('list', [path, options]);
        return Promise.resolve(resolveList(bucket));
      },
      upload(path: unknown, file: unknown, options?: unknown) {
        record('upload', [path, file, options]);
        return Promise.resolve(resolveUpload(bucket));
      },
      remove(paths: unknown) {
        record('remove', [paths]);
        const cfg = storageConfigs[bucket] ?? {};
        return Promise.resolve({ data: [] as unknown[], error: cfg.removeError ?? null });
      },
      createSignedUrl(path: unknown, expiresIn: unknown, options?: unknown) {
        record('createSignedUrl', [path, expiresIn, options]);
        return Promise.resolve(resolveSignedUrl(bucket));
      },
    };
  });

  function resolveList(bucket: string) {
    const cfg = storageConfigs[bucket] ?? {};
    if (cfg.listError) return { data: null, error: cfg.listError };
    return { data: (cfg.listResult ?? []) as unknown[], error: null };
  }

  function resolveUpload(bucket: string) {
    const cfg = storageConfigs[bucket] ?? {};
    if (cfg.uploadError) return { data: null, error: cfg.uploadError };
    return { data: { path: 'uploaded-path' }, error: null };
  }

  function resolveSignedUrl(bucket: string) {
    const cfg = storageConfigs[bucket] ?? {};
    if (cfg.createSignedUrlError) return { data: null, error: cfg.createSignedUrlError };
    return {
      data: {
        path: 'org-1/invoices/x/file.pdf',
        signedUrl: cfg.createSignedUrlResult ?? 'https://project.supabase.co/storage/v1/object/sign/file.pdf?token=abc',
      },
      error: null,
    };
  }

  const auth = {
    getUser: vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>(() =>
      Promise.resolve({ data: { user: null }, error: null })
    ),
  };

  return {
    supabaseServer: { auth, from, storage: { from: storageFrom } },
    tables,
    storageConfigs,
    getCalls: (table: string, method: string) =>
      allCalls.filter((c) => c.table === table && c.method === method).map((c) => c.args),
    getStorageCalls: (method: string) =>
      storageCalls.filter((c) => c.method === method).map((c) => c.args),
    clearCalls: () => {
      allCalls.length = 0;
      storageCalls.length = 0;
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

function authHeaders(orgId = 'org-1') {
  return { Authorization: 'Bearer valid-token', 'X-Organization-Id': orgId };
}

function calledWithTable(table: string): boolean {
  return m.supabaseServer.from.mock.calls.some((call) => call[0] === table);
}

function calledWithBucket(bucket: string): boolean {
  return m.supabaseServer.storage.from.mock.calls.some((call) => call[0] === bucket);
}

const BUCKET = 'invoices-private';

function resetState() {
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
  m.tables.organization_members = { single: MEMBERSHIP };
  m.storageConfigs[BUCKET] = {
    listResult: [],
    listError: null,
    uploadError: null,
    createSignedUrlResult: null,
    createSignedUrlError: null,
    removeError: null,
  };
}

describe('Invoice File Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.clearCalls();
    resetState();
    vi.mocked(m.supabaseServer.auth.getUser).mockResolvedValue({ data: { user: USER }, error: null });
  });

  it('POST /invoices/:id/upload rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(calledWithTable('invoices')).toBe(false);
    expect(calledWithBucket(BUCKET)).toBe(false);
  });

  it('POST /invoices/:id/upload rejects requests without an organization header', async () => {
    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .set('Authorization', 'Bearer valid-token')
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(calledWithBucket(BUCKET)).toBe(false);
  });

  it('POST /invoices/:id/upload rejects invalid UUIDs', async () => {
    const res = await request(app)
      .post('/api/v1/invoices/not-a-uuid/upload')
      .set(authHeaders())
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calledWithBucket(BUCKET)).toBe(false);
  });

  it('POST /invoices/:id/upload blocks cross-tenant invoices (IDOR)', async () => {
    m.tables.invoices.single = null;

    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .set(authHeaders())
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(m.getStorageCalls('upload')).toHaveLength(0);
  });

  it('POST /invoices/:id/upload rejects unsupported file extensions', async () => {
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .set(authHeaders())
      .attach('file', Buffer.from('MZ executable'), { filename: 'invoice.exe', contentType: 'application/octet-stream' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(m.getStorageCalls('upload')).toHaveLength(0);
  });

  it('POST /invoices/:id/upload rejects mismatched MIME types', async () => {
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .set(authHeaders())
      .attach('file', Buffer.from('plain text'), { filename: 'invoice.pdf', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(m.getStorageCalls('upload')).toHaveLength(0);
  });

  it('POST /invoices/:id/upload rejects files exceeding the size limit', async () => {
    m.tables.invoices.single = INVOICE_ROW;

    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .set(authHeaders())
      .attach('file', Buffer.alloc(MAX_FILE_SIZE + 1), { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(m.getStorageCalls('upload')).toHaveLength(0);
  });

  it('POST /invoices/:id/upload stores a valid PDF into the tenant-private bucket', async () => {
    m.tables.invoices.single = INVOICE_ROW;
    m.storageConfigs[BUCKET].listResult = [];

    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .set(authHeaders())
      .attach('file', Buffer.from('%PDF-1.4 fake invoice'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.file.path).toBe(`org-1/invoices/${INVOICE_ID}/file.pdf`);
    expect(res.body.data.file.fileName).toBe('file.pdf');
    expect(res.body.data.file.contentType).toBe('application/pdf');

    const uploadCalls = m.getStorageCalls('upload');
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0][0]).toBe(`org-1/invoices/${INVOICE_ID}/file.pdf`);
    expect((uploadCalls[0][1] as Buffer).length).toBeGreaterThan(0);
    expect(uploadCalls[0][2]).toEqual(
      expect.objectContaining({ contentType: 'application/pdf', upsert: true })
    );
    expect(calledWithBucket(BUCKET)).toBe(true);
  });

  it('POST /invoices/:id/upload replaces a previously stored file for the same invoice', async () => {
    m.tables.invoices.single = INVOICE_ROW;
    m.storageConfigs[BUCKET].listResult = [{ name: 'file_old.png', metadata: {} }];

    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .set(authHeaders())
      .attach('file', Buffer.from('png-bytes'), { filename: 'updated.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    const removeCalls = m.getStorageCalls('remove');
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0][0]).toEqual([`org-1/invoices/${INVOICE_ID}/file_old.png`]);

    const uploadCalls = m.getStorageCalls('upload');
    expect(uploadCalls[0][0]).toBe(`org-1/invoices/${INVOICE_ID}/file.png`);
  });

  it('POST /invoices/:id/upload is forbidden for viewer role', async () => {
    m.tables.organization_members = { single: { ...MEMBERSHIP, role: 'viewer' } };

    const res = await request(app)
      .post(`/api/v1/invoices/${INVOICE_ID}/upload`)
      .set(authHeaders())
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(calledWithBucket(BUCKET)).toBe(false);
  });

  it('GET /invoices/:id/file returns a signed URL for the stored document', async () => {
    m.tables.invoices.single = INVOICE_ROW;
    m.storageConfigs[BUCKET].listResult = [{ name: 'file.pdf', metadata: {} }];
    m.storageConfigs[BUCKET].createSignedUrlResult = 'https://project.supabase.co/sign/org-1/invoices/x/file.pdf?token=abc';

    const res = await request(app).get(`/api/v1/invoices/${INVOICE_ID}/file`).set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.file.signedUrl).toContain('token=abc');
    expect(res.body.data.file.fileName).toBe('file.pdf');
    expect(res.body.data.file.expiresIn).toBe(900);

    const signedUrlCalls = m.getStorageCalls('createSignedUrl');
    expect(signedUrlCalls).toHaveLength(1);
    expect(signedUrlCalls[0][0]).toBe(`org-1/invoices/${INVOICE_ID}/file.pdf`);
    expect(signedUrlCalls[0][1]).toBe(900);
    expect(signedUrlCalls[0][2]).toEqual({ download: 'file.pdf' });
  });

  it('GET /invoices/:id/file rejects unauthenticated requests', async () => {
    const res = await request(app).get(`/api/v1/invoices/${INVOICE_ID}/file`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(m.getStorageCalls('createSignedUrl')).toHaveLength(0);
  });

  it('GET /invoices/:id/file blocks cross-tenant invoices (IDOR)', async () => {
    m.tables.invoices.single = null;

    const res = await request(app).get(`/api/v1/invoices/${INVOICE_ID}/file`).set(authHeaders());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(m.getStorageCalls('createSignedUrl')).toHaveLength(0);
  });

  it('GET /invoices/:id/file returns 404 when no file has been uploaded', async () => {
    m.tables.invoices.single = INVOICE_ROW;
    m.storageConfigs[BUCKET].listResult = [];

    const res = await request(app).get(`/api/v1/invoices/${INVOICE_ID}/file`).set(authHeaders());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FILE_NOT_FOUND');
    expect(m.getStorageCalls('createSignedUrl')).toHaveLength(0);
  });
});
