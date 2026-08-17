import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/app';
import { registerCommunicationProvider, clearCommunicationProviders } from '../../server/services/communication';
import type { IEmailProvider } from '../../server/services/communication/EmailProvider';
import type { IWhatsAppProvider } from '../../server/services/communication/WhatsAppProvider';
import type { ICallProvider } from '../../server/services/communication/CallProvider';

// Hoisted mock of the server-side Supabase client (service-role). Never contacts network.
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};
  const chainCalls: Record<string, Array<[string, unknown[]]>> = {};

  const from = vi.fn((table: string) => {
    let insertData: unknown = null;
    let selectOptions: { count?: string } | null = null;
    let calledSingle = false;

    if (!chainCalls[table]) chainCalls[table] = [];
    const calls = chainCalls[table];

    function record(method: string, args: unknown[]) {
      calls.push([method, args]);
    }

    const chain = {
      insert(data: unknown) {
        insertData = data;
        record('insert', [data]);
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
    };

    function resolve() {
      const cfg = tables[table] ?? {};
      if (insertData !== null) {
        if (cfg.insertError) return { data: null, error: cfg.insertError };
        return { data: cfg.insertResult ?? { id: 'generated-id' }, error: null };
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
    getUser: vi.fn(() =>
      Promise.resolve({ data: { user: null }, error: null }) as Promise<{ data: unknown; error: unknown }>
    ),
  };

  return {
    supabaseServer: { auth, from },
    tables,
    getChainCalls: (table: string) => chainCalls[table] ?? [],
    clearCalls: () => {
      for (const key of Object.keys(chainCalls)) chainCalls[key] = [];
    },
  };
});

vi.mock('../../server/lib/supabaseClient', () => ({ supabaseServer: m.supabaseServer }));

const USER = { id: 'user-1', email: 'user@paypilot.test', role: 'authenticated' };
const MEMBERSHIP = {
  id: 'membership-1',
  organization_id: 'org-1',
  user_id: 'user-1',
  role: 'owner',
  status: 'active',
};
const CUSTOMER_ID = '123e4567-e89b-42d3-a456-426614174000';
const INVOICE_ID = '123e4567-e89b-42d3-a456-426614174010';

const CUSTOMER_ROW = {
  id: CUSTOMER_ID,
  organization_id: 'org-1',
  company_name: 'Globex Ltd',
  contact_name: 'Jane Doe',
  email: 'jane@globex.com',
  phone: '+919876543210',
  whatsapp_number: '+919876543211',
  gstin: null,
  billing_address: {},
  credit_period_days: 30,
  is_dnd: false,
  notes: null,
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const INVOICE_ROW = {
  id: INVOICE_ID,
  organization_id: 'org-1',
  customer_id: CUSTOMER_ID,
  invoice_number: 'INV-001',
  issue_date: '2026-08-01',
  due_date: '2099-12-31',
  currency: 'INR',
  subtotal: 1000,
  tax_total: 180,
  discount: 0,
  total_amount: 1180,
  amount_paid: 0,
  amount_due: 1180,
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

function authHeaders(orgId = 'org-1') {
  return { Authorization: 'Bearer valid-token', 'X-Organization-Id': orgId };
}

describe('Communication Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.clearCalls();
    clearCommunicationProviders();
    m.tables.customers = { single: null, singleError: null };
    m.tables.invoices = { single: null, singleError: null };
    m.tables.organizations = { single: { id: 'org-1', name: 'Test Org' }, singleError: null };
    m.tables.organization_members = { single: MEMBERSHIP, singleError: null };
    m.tables.communications = {
      rows: [],
      single: null,
      insertError: null,
      insertResult: null,
      listError: null,
      singleError: null,
    };
    vi.mocked(m.supabaseServer.auth.getUser).mockResolvedValue({ data: { user: USER }, error: null });
  });

  afterEach(() => {
    clearCommunicationProviders();
  });

  describe('GET /communications', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/communications');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects requests without an organization header', async () => {
      const res = await request(app).get('/api/v1/communications').set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('lists communications for the organization with pagination', async () => {
      m.tables.communications.rows = [
        { id: 'c1', organization_id: 'org-1', customer_id: CUSTOMER_ID, invoice_id: null, channel: 'email', direction: 'outbound', message: 'Hello', status: 'sent', provider_message_id: 'msg1', recipient_identifier: 'jane@globex.com', sent_at: '2026-08-16T12:00:00Z', metadata: {}, created_at: '2026-08-16T12:00:00Z' },
      ];

      const res = await request(app).get('/api/v1/communications').set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.data.communications).toHaveLength(1);
      expect(res.body.data.communications[0].channel).toBe('email');
      expect(res.body.data.communications[0].message).toBe('Hello');
      expect(res.body.pagination.totalCount).toBe(1);
    });

    it('supports filtering by channel, customerId and direction', async () => {
      m.tables.communications.rows = [];
      await request(app).get('/api/v1/communications?channel=whatsapp&customerId=' + CUSTOMER_ID + '&direction=inbound').set(authHeaders());

      const eqCalls = m.getChainCalls('communications').filter(([, args]) => args[0] === 'channel');
      expect(eqCalls).toHaveLength(1);
      expect(eqCalls[0][1]).toEqual(['channel', 'whatsapp']);
    });

    it('returns viewer role access', async () => {
      m.tables.organization_members = { single: { ...MEMBERSHIP, role: 'viewer' }, singleError: null };
      m.tables.communications.rows = [];
      const res = await request(app).get('/api/v1/communications').set(authHeaders());
      expect(res.status).toBe(200);
    });

    it('returns an empty array when no communications exist', async () => {
      m.tables.communications.rows = [];
      const res = await request(app).get('/api/v1/communications').set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.data.communications).toEqual([]);
    });
  });

  describe('POST /communications/send', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/v1/communications/send').send({ customerId: CUSTOMER_ID, channel: 'email', message: 'Hi' });
      expect(res.status).toBe(401);
    });

    it('is forbidden for viewer role', async () => {
      m.tables.organization_members = { single: { ...MEMBERSHIP, role: 'viewer' }, singleError: null };
      const res = await request(app).post('/api/v1/communications/send').set(authHeaders()).send({ customerId: CUSTOMER_ID, channel: 'email', message: 'Hi' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects invalid payloads', async () => {
      const res = await request(app).post('/api/v1/communications/send').set(authHeaders()).send({ customerId: 'bad', channel: 'sms', message: '' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when the customer is unknown', async () => {
      m.tables.customers.single = null;
      registerCommunicationProvider('email', () => ({
        sendEmail: vi.fn().mockResolvedValue({ messageId: 'x', status: 'sent', timestamp: new Date() }),
      } as IEmailProvider));

      const res = await request(app).post('/api/v1/communications/send').set(authHeaders()).send({ customerId: CUSTOMER_ID, channel: 'email', message: 'Hi' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('returns 400 when the customer has no email', async () => {
      m.tables.customers.single = { ...CUSTOMER_ROW, email: null };
      registerCommunicationProvider('email', () => ({
        sendEmail: vi.fn().mockResolvedValue({ messageId: 'x', status: 'sent', timestamp: new Date() }),
      } as IEmailProvider));

      const res = await request(app).post('/api/v1/communications/send').set(authHeaders()).send({ customerId: CUSTOMER_ID, channel: 'email', message: 'Hi' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOMER_NO_EMAIL');
    });

    it('returns 400 when the customer has no phone for whatsapp', async () => {
      m.tables.customers.single = { ...CUSTOMER_ROW, whatsapp_number: null, phone: null };
      registerCommunicationProvider('whatsapp', () => ({
        sendTemplateMessage: vi.fn(),
        sendTextMessage: vi.fn().mockResolvedValue({ providerMessageId: 'x', status: 'sent', timestamp: new Date() }),
        verifyWebhookSignature: vi.fn(),
      } as IWhatsAppProvider));

      const res = await request(app).post('/api/v1/communications/send').set(authHeaders()).send({ customerId: CUSTOMER_ID, channel: 'whatsapp', message: 'Hi' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOMER_NO_PHONE');
    });

    it('returns 400 when the customer has no phone for call', async () => {
      m.tables.customers.single = { ...CUSTOMER_ROW, phone: null };
      registerCommunicationProvider('call', () => ({
        initiateOutboundCall: vi.fn().mockResolvedValue({ providerCallId: 'x', status: 'queued', timestamp: new Date() }),
        fetchCallRecording: vi.fn(),
      } as ICallProvider));

      const res = await request(app).post('/api/v1/communications/send').set(authHeaders()).send({ customerId: CUSTOMER_ID, channel: 'call', message: 'Hi' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOMER_NO_PHONE');
    });

    it('returns 503 when no provider is configured for the channel', async () => {
      m.tables.customers.single = CUSTOMER_ROW;
      const res = await request(app).post('/api/v1/communications/send').set(authHeaders()).send({ customerId: CUSTOMER_ID, channel: 'email', message: 'Hi' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('COMMUNICATION_PROVIDER_NOT_CONFIGURED');
    });

    it('returns 404 when the optional invoice is outside the organization', async () => {
      m.tables.customers.single = CUSTOMER_ROW;
      m.tables.invoices.single = null;
      registerCommunicationProvider('email', () => ({
        sendEmail: vi.fn().mockResolvedValue({ messageId: 'x', status: 'sent', timestamp: new Date() }),
      } as IEmailProvider));

      const res = await request(app).post('/api/v1/communications/send').set(authHeaders()).send({ customerId: CUSTOMER_ID, channel: 'email', message: 'Hi', invoiceId: INVOICE_ID });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
    });

    it('sends an email via the provider and records the communication', async () => {
      const sendEmail = vi.fn().mockResolvedValue({ messageId: 'msg_email_001', status: 'sent', timestamp: new Date('2026-08-16T12:00:00Z') });
      registerCommunicationProvider('email', () => ({ sendEmail } as IEmailProvider));

      m.tables.customers.single = CUSTOMER_ROW;
      m.tables.communications.insertResult = {
        id: 'comm-1',
        organization_id: 'org-1',
        customer_id: CUSTOMER_ID,
        invoice_id: null,
        channel: 'email',
        direction: 'outbound',
        message: 'Payment reminder',
        subject: 'Reminder from PayPilot',
        status: 'sent',
        provider_message_id: 'msg_email_001',
        recipient_identifier: 'jane@globex.com',
        sent_at: '2026-08-16T12:00:00Z',
        metadata: { providerStatus: 'sent' },
        created_at: '2026-08-16T12:00:00Z',
      };

      const res = await request(app)
        .post('/api/v1/communications/send')
        .set(authHeaders())
        .send({ customerId: CUSTOMER_ID, channel: 'email', message: 'Payment reminder' });

      expect(res.status).toBe(201);
      expect(res.body.data.communication.channel).toBe('email');
      expect(res.body.data.communication.status).toBe('sent');
      expect(res.body.data.communication.providerMessageId).toBe('msg_email_001');
      expect(res.body.data.communication.message).toBe('Payment reminder');

      expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'jane@globex.com',
        html: 'Payment reminder',
      }));

      // The communication response has the client's org ID — this is an
      // authenticated endpoint, not a customer-facing one, so orgId is expected.
      expect(res.body.data.communication.organizationId).toBe('org-1');
    });

    it('passes through the invoiceId when the invoice belongs to the same organization', async () => {
      const sendEmail = vi.fn().mockResolvedValue({ messageId: 'msg2', status: 'queued', timestamp: new Date('2026-08-16T12:00:00Z') });
      registerCommunicationProvider('email', () => ({ sendEmail } as IEmailProvider));

      m.tables.customers.single = CUSTOMER_ROW;
      m.tables.invoices.single = INVOICE_ROW;
      m.tables.communications.insertResult = {
        id: 'comm-2',
        organization_id: 'org-1',
        customer_id: CUSTOMER_ID,
        invoice_id: INVOICE_ID,
        channel: 'email',
        direction: 'outbound',
        message: 'Hi',
        subject: 'Reminder from PayPilot',
        status: 'queued',
        provider_message_id: 'msg2',
        recipient_identifier: 'jane@globex.com',
        sent_at: '2026-08-16T12:00:00Z',
        metadata: { providerStatus: 'queued' },
        created_at: '2026-08-16T12:00:00Z',
      };

      const res = await request(app)
        .post('/api/v1/communications/send')
        .set(authHeaders())
        .send({ customerId: CUSTOMER_ID, channel: 'email', message: 'Hi', invoiceId: INVOICE_ID });

      expect(res.status).toBe(201);
      expect(res.body.data.communication.invoiceId).toBe(INVOICE_ID);

      // The insert row should include the invoice_id.
      const insertCall = m.getChainCalls('communications').find(([, a]) => a[0] && typeof a[0] === 'object' && 'invoice_id' in (a[0] as Record<string, unknown>));
      expect(insertCall).toBeDefined();
    });
  });
});
