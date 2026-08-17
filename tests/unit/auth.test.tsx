import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from '../../client/src/App';

// Hoisted mocks for Supabase client + API client shared across all client auth tests.
const m = vi.hoisted(() => {
  const user = {
    id: 'user-1',
    email: 'owner@paypilot.test',
    app_metadata: { role: 'authenticated' },
    user_metadata: { full_name: 'Owner' },
  };
  const baseSession = {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_at: 2000000000,
    user,
  };
  const profile = {
    id: user.id,
    email: user.email,
    fullName: 'Owner',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const organization = {
    id: 'org-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    billingAddress: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    role: 'owner',
  };

  const listeners: Array<(event: string, session: unknown) => void> = [];

  const supabase = {
    auth: {
      getSession: vi.fn<() => Promise<{ data: unknown; error: unknown }>>(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      setSession: vi.fn<
        (s: { access_token: string; refresh_token: string }) => Promise<{ data: unknown; error: unknown }>
      >((s) => {
        const session = { ...baseSession, access_token: s.access_token, refresh_token: s.refresh_token };
        listeners.forEach((cb) => cb('SIGNED_IN', session));
        return Promise.resolve({ data: { session }, error: null });
      }),
      signOut: vi.fn<() => Promise<{ error: unknown }>>(() => {
        listeners.forEach((cb) => cb('SIGNED_OUT', null));
        return Promise.resolve({ error: null });
      }),
      updateUser: vi.fn<
        (opts: { password: string }) => Promise<{ data: unknown; error: unknown }>
      >(() => Promise.resolve({ data: { user }, error: null })),
      resetPasswordForEmail: vi.fn<
        (email: string, options?: Record<string, unknown>) => Promise<{ error: unknown }>
      >(() => Promise.resolve({ error: null })),
      exchangeCodeForSession: vi.fn<
        (code: string) => Promise<{ data: unknown; error: unknown }>
      >(() => Promise.resolve({ data: { session: baseSession }, error: null })),
    },
  };

  const apiRequest = vi.fn<(endpoint: string, options?: unknown) => Promise<unknown>>(
    async (endpoint: string) => {
      switch (endpoint) {
        case '/auth/login':
          return { success: true, data: { session: { ...baseSession }, organizations: [organization] } };
        case '/auth/signup':
          return { success: true, data: { user, organization, session: { ...baseSession } } };
        case '/auth/me':
          return { success: true, data: { profile, organizations: [organization] } };
        case '/auth/logout':
          return { success: true, data: { message: 'Logged out' } };
        case '/auth/reset-password':
          return { success: true, data: { message: 'If an account exists, a reset link was sent.' } };
        default:
          return { success: true, data: {} };
      }
    }
  );

  return { supabase, apiRequest, baseSession };
});

vi.mock('../../client/src/lib/supabaseClient', () => ({ supabase: m.supabase }));
vi.mock('../../client/src/lib/apiClient', () => ({ apiRequest: m.apiRequest }));

async function fillAndSubmit(label: string, values: Record<string, string>) {
  for (const [fieldLabel, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(fieldLabel), { target: { value } });
  }
  await act(async () => {
    fireEvent.submit(screen.getByRole('form', { name: label }));
  });
}

describe('Client Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  it('protects routes and shows the login page when unauthenticated', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole('heading', { name: 'Sign in to PayPilot' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    // The protected application shell must not be rendered.
    expect(screen.queryByText('Accounts Receivable Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('No invoices yet')).not.toBeInTheDocument();
  });

  it('restores a persisted session on load (session persistence)', async () => {
    vi.mocked(m.supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: m.baseSession },
      error: null,
    });

    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByRole('heading', { name: 'Sign in to PayPilot' })).not.toBeInTheDocument();
    expect(await screen.findByText('Accounts Receivable Overview')).toBeInTheDocument();
    expect(m.supabase.auth.getSession).toHaveBeenCalled();
  });

  it('logs in with valid credentials and renders the protected app', async () => {
    await act(async () => {
      render(<App />);
    });

    await fillAndSubmit('Sign in', {
      'Email address': 'owner@paypilot.test',
      Password: 'password123',
    });

    expect(m.apiRequest).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({ method: 'POST' })
    );
    expect(m.supabase.auth.setSession).toHaveBeenCalled();
    expect(await screen.findByText('Accounts Receivable Overview')).toBeInTheDocument();
  });

  it('shows an error message for invalid credentials', async () => {
    vi.mocked(m.apiRequest).mockResolvedValueOnce({
      success: false,
      error: { code: 'LOGIN_FAILED', message: 'Invalid email or password.' },
    });

    await act(async () => {
      render(<App />);
    });

    await fillAndSubmit('Sign in', {
      'Email address': 'owner@paypilot.test',
      Password: 'wrong-password',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.queryByText('Accounts Receivable Overview')).not.toBeInTheDocument();
  });

  it('signs up a new user and organization, then enters the app', async () => {
    await act(async () => {
      render(<App />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create one' }));

    await fillAndSubmit('Sign up', {
      'Full name': 'Jane Doe',
      'Organization name': 'Acme Corp',
      'Email address': 'jane@acme.test',
      Password: 'password123',
    });

    expect(m.apiRequest).toHaveBeenCalledWith(
      '/auth/signup',
      expect.objectContaining({ method: 'POST' })
    );
    expect(await screen.findByText('Accounts Receivable Overview')).toBeInTheDocument();
  });

  it('logs out and returns to the login screen', async () => {
    vi.mocked(m.supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: m.baseSession },
      error: null,
    });

    await act(async () => {
      render(<App />);
    });
    expect(await screen.findByText('Accounts Receivable Overview')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Sign Out'));
    });

    expect(m.supabase.auth.signOut).toHaveBeenCalled();
    expect(m.apiRequest).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to PayPilot' })).toBeInTheDocument();
  });

  it('requests a password reset email', async () => {
    await act(async () => {
      render(<App />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    await fillAndSubmit('Forgot password', { 'Email address': 'owner@paypilot.test' });

    expect(m.apiRequest).toHaveBeenCalledWith(
      '/auth/reset-password',
      expect.objectContaining({ method: 'POST' })
    );
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('completes the password reset flow from a recovery link', async () => {
    window.location.hash =
      '#type=recovery&access_token=access-recovery&refresh_token=refresh-recovery&expires_at=2000000000';

    await act(async () => {
      render(<App />);
    });

    expect(m.supabase.auth.setSession).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'access-recovery' })
    );

    await fillAndSubmit('Reset password', {
      'New password': 'newpassword123',
      'Confirm new password': 'newpassword123',
    });

    expect(m.supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword123' });
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
  });

  it('rejects mismatched passwords on the reset form', async () => {
    window.location.hash =
      '#type=recovery&access_token=access-recovery&refresh_token=refresh-recovery&expires_at=2000000000';

    await act(async () => {
      render(<App />);
    });

    await fillAndSubmit('Reset password', {
      'New password': 'newpassword123',
      'Confirm new password': 'different123',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(m.supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Password updated' })).not.toBeInTheDocument();
  });
});
