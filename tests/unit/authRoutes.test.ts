import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/app';

// Hoisted mock of the server-side Supabase client (service-role). Never contacts network.
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};

  const from = vi.fn((table: string) => {
    let insertData: unknown = null;

    const self: {
      insert: (data: unknown) => typeof self;
      select: () => typeof self;
      eq: () => typeof self;
      order: () => typeof self;
      single: () => Promise<unknown>;
      then: (onFulfilled: (value: unknown) => unknown) => Promise<unknown>;
      catch: (onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
      finally: (onFinally?: () => void) => Promise<unknown>;
    } = {
      insert(data: unknown) {
        insertData = data;
        return self;
      },
      select() {
        return self;
      },
      eq() {
        return self;
      },
      order() {
        return self;
      },
      single() {
        return Promise.resolve(resolve());
      },
      then(onFulfilled) {
        return Promise.resolve(resolve()).then(onFulfilled);
      },
      catch(onRejected) {
        return Promise.resolve(resolve()).catch(onRejected);
      },
      finally(onFinally) {
        return Promise.resolve(resolve()).finally(onFinally);
      },
    };

    function resolve() {
      const cfg = tables[table] ?? {};
      if (insertData) {
        if (table === 'organizations') {
          const orgInsertResult = cfg.orgInsertResult as { error: unknown; data: unknown };
          return orgInsertResult ?? { error: null, data: { id: 'org-1' } };
        }
        return { error: cfg.insertError ?? null, data: null };
      }
      return { error: null, data: cfg.rows ?? null };
    }

    return self;
  });

  const auth = {
    admin: {
      createUser: vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>(() =>
        Promise.resolve({ data: { user: null }, error: null })
      ),
      deleteUser: vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>(() =>
        Promise.resolve({ data: null, error: null })
      ),
    },
    signInWithPassword: vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>(() =>
      Promise.resolve({ data: { session: null, user: null }, error: null })
    ),
    getUser: vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>(() =>
      Promise.resolve({ data: { user: null }, error: null })
    ),
    signOut: vi.fn<(...args: unknown[]) => Promise<{ error: unknown }>>(() =>
      Promise.resolve({ error: null })
    ),
    resetPasswordForEmail: vi.fn<(...args: unknown[]) => Promise<{ error: unknown }>>(() =>
      Promise.resolve({ error: null })
    ),
  };

  return {
    supabaseServer: { auth, from },
    tables,
  };
});

vi.mock('../../server/lib/supabaseClient', () => ({ supabaseServer: m.supabaseServer }));

const SIGNUP_PAYLOAD = {
  email: 'owner@paypilot.test',
  password: 'password123',
  fullName: 'Owner User',
  organizationName: 'Acme Corp',
};

const VALID_SESSION = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 2000000000,
};

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.tables.profiles = { rows: null, insertError: null };
    m.tables.organizations = {
      rows: null,
      insertError: null,
      orgInsertResult: { error: null, data: { id: 'org-1' } },
    };
    m.tables.organization_members = { rows: null, insertError: null };
  });

  it('POST /auth/signup creates auth user, profile, organization, and owner membership', async () => {
    vi.mocked(m.supabaseServer.auth.admin.createUser).mockResolvedValue({
      data: { user: { id: 'user-1', email: SIGNUP_PAYLOAD.email } },
      error: null,
    });
    vi.mocked(m.supabaseServer.auth.signInWithPassword).mockResolvedValue({
      data: { session: VALID_SESSION, user: { id: 'user-1', email: SIGNUP_PAYLOAD.email } },
      error: null,
    });

    const res = await request(app).post('/api/v1/auth/signup').send(SIGNUP_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify the exact provisioning sequence.
    expect(m.supabaseServer.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: SIGNUP_PAYLOAD.email })
    );
    expect(m.supabaseServer.from).toHaveBeenCalledWith('profiles');
    expect(m.supabaseServer.from).toHaveBeenCalledWith('organizations');
    expect(m.supabaseServer.from).toHaveBeenCalledWith('organization_members');

    expect(res.body.data.session.access_token).toBe('access-token');
    expect(res.body.data.organization.id).toBe('org-1');
  });

  it('POST /auth/signup rejects an email that is already registered', async () => {
    vi.mocked(m.supabaseServer.auth.admin.createUser).mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const res = await request(app).post('/api/v1/auth/signup').send(SIGNUP_PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SIGNUP_FAILED');
    expect(res.body.error.message).toContain('already exists');
  });

  it('POST /auth/signup rejects invalid payloads', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'not-an-email', password: 'short', fullName: '', organizationName: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(m.supabaseServer.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('POST /auth/login returns a session and organization memberships', async () => {
    vi.mocked(m.supabaseServer.auth.signInWithPassword).mockResolvedValue({
      data: {
        session: VALID_SESSION,
        user: { id: 'user-1', email: SIGNUP_PAYLOAD.email },
      },
      error: null,
    });
    m.tables.profiles = {
      rows: { id: 'user-1', email: SIGNUP_PAYLOAD.email, full_name: 'Owner User' },
    };
    m.tables.organization_members = {
      rows: [
        {
          organization_id: 'org-1',
          role: 'owner',
          organizations: {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme-corp',
            logo_url: null,
            currency: 'INR',
            timezone: 'Asia/Kolkata',
          },
        },
      ],
    };

    const res = await request(app).post('/api/v1/auth/login').send({
      email: SIGNUP_PAYLOAD.email,
      password: SIGNUP_PAYLOAD.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.session.access_token).toBe('access-token');
    expect(res.body.data.organizations).toHaveLength(1);
    expect(res.body.data.organizations[0].role).toBe('owner');
    expect(res.body.data.organizations[0].id).toBe('org-1');
  });

  it('POST /auth/login rejects invalid credentials', async () => {
    vi.mocked(m.supabaseServer.auth.signInWithPassword).mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials' },
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: SIGNUP_PAYLOAD.email,
      password: 'wrong-password',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('LOGIN_FAILED');
  });

  it('POST /auth/logout signs out the session', async () => {
    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(m.supabaseServer.auth.signOut).toHaveBeenCalled();
  });

  it('POST /auth/reset-password sends a reset email without revealing account existence', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'unknown@paypilot.test',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(m.supabaseServer.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'unknown@paypilot.test',
      expect.objectContaining({ redirectTo: expect.stringContaining('reset-password') })
    );
  });

  it('GET /auth/me rejects requests without a valid token (protected route)', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /auth/me rejects invalid/expired tokens', async () => {
    vi.mocked(m.supabaseServer.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    });

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer expired-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /auth/me returns the profile and organizations for a valid token', async () => {
    vi.mocked(m.supabaseServer.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-1', email: SIGNUP_PAYLOAD.email, role: 'authenticated' } },
      error: null,
    });
    m.tables.profiles = {
      rows: {
        id: 'user-1',
        email: SIGNUP_PAYLOAD.email,
        full_name: 'Owner User',
        phone_number: null,
        avatar_url: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    };
    m.tables.organization_members = {
      rows: [
        {
          organization_id: 'org-1',
          role: 'owner',
          organizations: {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme-corp',
            logo_url: null,
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        },
      ],
    };

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.profile.id).toBe('user-1');
    expect(res.body.data.profile.fullName).toBe('Owner User');
    expect(res.body.data.organizations).toHaveLength(1);
    expect(res.body.data.organizations[0].name).toBe('Acme Corp');
  });
});
