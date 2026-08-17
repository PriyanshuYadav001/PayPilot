import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/app';

const RULE_ID = '123e4567-e89b-42d3-a456-426614174000';

const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};

  const from = vi.fn((table: string) => {
    const cfg = tables[table] ?? {};
    let insertData: unknown = null;
    let updateData: unknown = null;
    let deleteMode = false;

    const chain = {
      insert(data: unknown) {
        insertData = data;
        return chain;
      },
      update(data: unknown) {
        updateData = data;
        return chain;
      },
      delete() {
        deleteMode = true;
        return chain;
      },
      select(_cols?: unknown, opts?: { count?: string }) {
        return chain;
      },
      eq(_col: unknown, _val: unknown) {
        return chain;
      },
      order(_col: unknown, _opts?: unknown) {
        return chain;
      },
      range(_from: unknown, _to: unknown) {
        return chain;
      },
      single() {
        if (insertData) {
          return Promise.resolve({ data: { id: 'gen-rule', ...insertData as object }, error: null });
        }
        if (updateData) {
          return Promise.resolve({ data: { id: RULE_ID, ...updateData as object }, error: null });
        }
        if (deleteMode) {
          return Promise.resolve({ data: cfg.single ?? null, error: null });
        }
        return Promise.resolve({ data: cfg.single ?? null, error: cfg.singleError ?? null });
      },
      maybeSingle() {
        if (deleteMode) {
          return Promise.resolve({ data: cfg.single ?? null, error: null });
        }
        return Promise.resolve({ data: cfg.single ?? null, error: cfg.singleError ?? null });
      },
    };

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

const RULE_ROW = {
  id: RULE_ID,
  organization_id: 'org-1',
  name: 'Upcoming Due Reminder',
  is_active: true,
  days_relative_to_due: -3,
  channel: 'email',
  template_subject: 'Invoice Due Soon',
  template_body: 'Hi {{contact_name}}, invoice {{invoice_number}} is due soon.',
  template_id_external: null,
  escalation_priority: 1,
  include_payment_link: true,
  include_qr_code: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function authHeaders(orgId = 'org-1') {
  return { Authorization: 'Bearer valid-token', 'X-Organization-Id': orgId };
}

describe('Follow-Up Rules Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.tables.follow_up_rules = { rows: [RULE_ROW], single: RULE_ROW, singleError: null };
    m.tables.organization_members = { single: MEMBERSHIP, singleError: null };
    vi.mocked(m.supabaseServer.auth.getUser).mockResolvedValue({ data: { user: USER }, error: null });
  });

  describe('GET /follow-up-rules', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/follow-up-rules');
      expect(res.status).toBe(401);
    });

    it('rejects requests without an organization header', async () => {
      const res = await request(app).get('/api/v1/follow-up-rules').set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(400);
    });

    it('returns a list of rules', async () => {
      const res = await request(app).get('/api/v1/follow-up-rules').set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rules).toBeDefined();
      expect(Array.isArray(res.body.data.rules)).toBe(true);
    });

    it('supports pagination query params', async () => {
      const res = await request(app).get('/api/v1/follow-up-rules?page=1&limit=5').set(authHeaders());
      expect(res.status).toBe(200);
    });

    it('supports isActive filter', async () => {
      const res = await request(app).get('/api/v1/follow-up-rules?isActive=true').set(authHeaders());
      expect(res.status).toBe(200);
    });

    it('supports channel filter', async () => {
      const res = await request(app).get('/api/v1/follow-up-rules?channel=email').set(authHeaders());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /follow-up-rules/:id', () => {
    it('returns a single rule', async () => {
      const res = await request(app).get(`/api/v1/follow-up-rules/${RULE_ID}`).set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.data.rule).toBeDefined();
    });

    it('returns 404 for unknown rule', async () => {
      m.tables.follow_up_rules.single = null;
      const res = await request(app).get(`/api/v1/follow-up-rules/${RULE_ID}`).set(authHeaders());
      expect(res.status).toBe(404);
    });

    it('rejects invalid UUID param', async () => {
      const res = await request(app).get('/api/v1/follow-up-rules/not-a-uuid').set(authHeaders());
      expect(res.status).toBe(400);
    });
  });

  describe('POST /follow-up-rules', () => {
    it('creates a new rule', async () => {
      const res = await request(app)
        .post('/api/v1/follow-up-rules')
        .set(authHeaders())
        .send({
          name: 'Overdue Alert',
          daysRelativeToDue: 3,
          channel: 'whatsapp',
          templateBody: 'Invoice overdue',
          escalationPriority: 2,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.rule).toBeDefined();
    });

    it('rejects invalid payloads', async () => {
      const res = await request(app)
        .post('/api/v1/follow-up-rules')
        .set(authHeaders())
        .send({ name: '', channel: 'sms' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/follow-up-rules')
        .set(authHeaders())
        .send({ name: 'Test' });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /follow-up-rules/:id', () => {
    it('updates a rule', async () => {
      const res = await request(app)
        .patch(`/api/v1/follow-up-rules/${RULE_ID}`)
        .set(authHeaders())
        .send({ name: 'Updated Rule' });
      expect(res.status).toBe(200);
      expect(res.body.data.rule).toBeDefined();
    });

    it('returns 404 for unknown rule', async () => {
      m.tables.follow_up_rules.single = null;
      const res = await request(app)
        .patch(`/api/v1/follow-up-rules/${RULE_ID}`)
        .set(authHeaders())
        .send({ name: 'Updated' });
      expect(res.status).toBe(404);
    });

    it('rejects empty update body', async () => {
      const res = await request(app)
        .patch(`/api/v1/follow-up-rules/${RULE_ID}`)
        .set(authHeaders())
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects invalid UUID param', async () => {
      const res = await request(app)
        .patch('/api/v1/follow-up-rules/bad-id')
        .set(authHeaders())
        .send({ name: 'Test' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /follow-up-rules/:id', () => {
    it('deletes a rule', async () => {
      const res = await request(app).delete(`/api/v1/follow-up-rules/${RULE_ID}`).set(authHeaders());
      expect(res.status).toBe(200);
      expect(res.body.data.rule).toBeDefined();
    });

    it('returns 404 for unknown rule', async () => {
      m.tables.follow_up_rules.single = null;
      const res = await request(app).delete(`/api/v1/follow-up-rules/${RULE_ID}`).set(authHeaders());
      expect(res.status).toBe(404);
    });

    it('rejects invalid UUID param', async () => {
      const res = await request(app).delete('/api/v1/follow-up-rules/bad-id').set(authHeaders());
      expect(res.status).toBe(400);
    });
  });

  describe('Role-based access', () => {
    it('rejects viewer role for POST', async () => {
      m.tables.organization_members.single = { ...MEMBERSHIP, role: 'viewer' };
      const res = await request(app)
        .post('/api/v1/follow-up-rules')
        .set(authHeaders())
        .send({ name: 'Test', daysRelativeToDue: 0, channel: 'email', templateBody: 'test' });
      expect(res.status).toBe(403);
    });

    it('rejects viewer role for PATCH', async () => {
      m.tables.organization_members.single = { ...MEMBERSHIP, role: 'viewer' };
      const res = await request(app)
        .patch(`/api/v1/follow-up-rules/${RULE_ID}`)
        .set(authHeaders())
        .send({ name: 'Test' });
      expect(res.status).toBe(403);
    });

    it('rejects viewer role for DELETE', async () => {
      m.tables.organization_members.single = { ...MEMBERSHIP, role: 'viewer' };
      const res = await request(app).delete(`/api/v1/follow-up-rules/${RULE_ID}`).set(authHeaders());
      expect(res.status).toBe(403);
    });

    it('allows member role for POST', async () => {
      m.tables.organization_members.single = { ...MEMBERSHIP, role: 'member' };
      const res = await request(app)
        .post('/api/v1/follow-up-rules')
        .set(authHeaders())
        .send({ name: 'Test Rule', daysRelativeToDue: 0, channel: 'email', templateBody: 'Hello {{contact_name}}' });
      expect(res.status).toBe(201);
    });

    it('allows admin role for DELETE', async () => {
      m.tables.organization_members.single = { ...MEMBERSHIP, role: 'admin' };
      const res = await request(app).delete(`/api/v1/follow-up-rules/${RULE_ID}`).set(authHeaders());
      expect(res.status).toBe(200);
    });
  });
});
