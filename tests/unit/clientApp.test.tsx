import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from '../../client/src/App';

// Hoisted mock of the Supabase client + API client so the app renders as an authenticated user.
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
      getSession: vi.fn(() => Promise.resolve({ data: { session: baseSession }, error: null })),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      setSession: vi.fn((s: { access_token: string; refresh_token: string }) => {
        const session = { ...baseSession, access_token: s.access_token, refresh_token: s.refresh_token };
        listeners.forEach((cb) => cb('SIGNED_IN', session));
        return Promise.resolve({ data: { session }, error: null });
      }),
      signOut: vi.fn(() => {
        listeners.forEach((cb) => cb('SIGNED_OUT', null));
        return Promise.resolve({ error: null });
      }),
      updateUser: vi.fn(() => Promise.resolve({ data: { user }, error: null })),
      resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: null })),
    },
  };

  const apiRequest = vi.fn(async (endpoint: string) => {
    if (endpoint === '/auth/me') {
      return { success: true, data: { profile, organizations: [organization] } };
    }
    if (endpoint.startsWith('/customers')) {
      return {
        success: true,
        data: { customers: [] },
        pagination: { page: 1, limit: 10, totalCount: 0, totalPages: 0 },
      };
    }
    if (endpoint.startsWith('/invoices')) {
      return {
        success: true,
        data: { invoices: [] },
        pagination: { page: 1, limit: 10, totalCount: 0, totalPages: 0 },
      };
    }
    return { success: true, data: {} };
  });

  return { supabase, apiRequest };
});

vi.mock('../../client/src/lib/supabaseClient', () => ({ supabase: m.supabase }));
vi.mock('../../client/src/lib/apiClient', () => ({ apiRequest: m.apiRequest }));

describe('Client React Application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders application brand and initial dashboard view', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText('PayPilot')).toBeInTheDocument();
    expect(await screen.findByText('Accounts Receivable Overview')).toBeInTheDocument();
    expect(screen.getByText('Total Outstanding AR')).toBeInTheDocument();
  });

  it('switches views when clicking sidebar navigation items', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(await screen.findByText('Accounts Receivable Overview')).toBeInTheDocument();

    // Click Invoices tab
    const invoicesButton = screen.getByRole('button', { name: /invoices/i });
    await act(async () => {
      fireEvent.click(invoicesButton);
    });
    expect(await screen.findByText('No invoices yet')).toBeInTheDocument();

    // Click Customers tab
    const customersButton = screen.getByRole('button', { name: /customers/i });
    await act(async () => {
      fireEvent.click(customersButton);
    });
    expect(await screen.findByText('No customers registered')).toBeInTheDocument();

    // Click Follow-ups tab
    const followUpsButton = screen.getByRole('button', { name: /follow-ups/i });
    await act(async () => {
      fireEvent.click(followUpsButton);
    });
    expect(screen.getByText('Follow-up Cadence Rules')).toBeInTheDocument();

    // Click Settings tab
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await act(async () => {
      fireEvent.click(settingsButton);
    });
    expect(screen.getByText('Settings & Integrations')).toBeInTheDocument();
  });
});
