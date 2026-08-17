import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from '../../client/src/App';

// Hoisted mocks: authenticated Supabase session + in-memory customers store
// served by the API client mock.
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

  interface CustomerRow {
    id: string;
    organizationId: string;
    companyName: string;
    contactName: string;
    email: string;
    phone: string | null;
    billingAddress: Record<string, unknown>;
    creditPeriodDays: number;
    isDnd: boolean;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }

  const defaultCustomers: CustomerRow[] = [
    {
      id: 'c-1',
      organizationId: 'org-1',
      companyName: 'Globex Ltd',
      contactName: 'Jane Doe',
      email: 'jane@globex.com',
      phone: '+91 98765 43210',
      billingAddress: {},
      creditPeriodDays: 45,
      isDnd: false,
      metadata: {},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'c-2',
      organizationId: 'org-1',
      companyName: 'Initech',
      contactName: 'Bob Smith',
      email: 'bob@initech.com',
      phone: null,
      billingAddress: {},
      creditPeriodDays: 30,
      isDnd: false,
      metadata: {},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  let customers: CustomerRow[] = [...defaultCustomers];

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

  const apiRequest = vi.fn<(endpoint: string, options?: unknown) => Promise<unknown>>(
    async (endpoint: string, options?: unknown) => {
      if (endpoint === '/auth/me') {
        return { success: true, data: { profile, organizations: [organization] } };
      }

      const opts = (options ?? {}) as { method?: string; body?: string };
      const url = new URL(endpoint, 'http://test');

      if (url.pathname === '/customers') {
        if (opts.method === 'POST') {
          const body = JSON.parse(opts.body ?? '{}');
          const customer: CustomerRow = {
            id: 'c-created',
            organizationId: 'org-1',
            ...body,
            billingAddress: body.billingAddress ?? {},
            creditPeriodDays: body.creditPeriodDays ?? 30,
            isDnd: body.isDnd ?? false,
            metadata: {},
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          };
          customers.push(customer);
          return { success: true, data: { customer } };
        }

        const searchTerm = url.searchParams.get('search') ?? '';
        let rows = customers;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          rows = customers.filter((c) =>
            `${c.companyName} ${c.contactName} ${c.email}`.toLowerCase().includes(term)
          );
        }
        return {
          success: true,
          data: { customers: rows },
          pagination: {
            page: 1,
            limit: 10,
            totalCount: rows.length,
            totalPages: Math.max(1, Math.ceil(rows.length / 10)),
          },
        };
      }

      if (url.pathname.startsWith('/customers/')) {
        const id = url.pathname.split('/')[2];
        if (opts.method === 'DELETE') {
          customers = customers.filter((c) => c.id !== id);
          return { success: true, data: { message: 'Deleted' } };
        }
        const customer = customers.find((c) => c.id === id);
        if (customer) return { success: true, data: { customer } };
        return { success: false, error: { code: 'NOT_FOUND', message: 'Customer not found.' } };
      }

      return { success: true, data: {} };
    }
  );

  return {
    supabase,
    apiRequest,
    resetCustomers: () => {
      customers = [...defaultCustomers];
    },
    clearCustomers: () => {
      customers = [];
    },
  };
});

vi.mock('../../client/src/lib/supabaseClient', () => ({ supabase: m.supabase }));
vi.mock('../../client/src/lib/apiClient', () => ({ apiRequest: m.apiRequest }));

async function openCustomersTab() {
  const customersButton = screen.getByRole('button', { name: /customers/i });
  await act(async () => {
    fireEvent.click(customersButton);
  });
}

describe('Customers Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resetCustomers();
  });

  it('renders the customer list from the API', async () => {
    await act(async () => {
      render(<App />);
    });
    await openCustomersTab();

    expect(await screen.findByText('Globex Ltd')).toBeInTheDocument();
    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(screen.getByText('jane@globex.com')).toBeInTheDocument();
    expect(screen.getByText('bob@initech.com')).toBeInTheDocument();
    expect(m.apiRequest).toHaveBeenCalledWith(
      expect.stringMatching(/^\/customers\?/),
      expect.objectContaining({ orgId: 'org-1' })
    );
  });

  it('shows the empty state when there are no customers', async () => {
    m.clearCustomers();
    await act(async () => {
      render(<App />);
    });
    await openCustomersTab();

    expect(await screen.findByText('No customers registered')).toBeInTheDocument();
  });

  it('adds a new customer through the modal', async () => {
    await act(async () => {
      render(<App />);
    });
    await openCustomersTab();
    expect(await screen.findByText('Globex Ltd')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Customer' }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Umbrella Corp' } });
      fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Alice Johnson' } });
      fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alice@umbrella.com' } });
      fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+1 555 0100' } });
      fireEvent.change(screen.getByLabelText('Credit period (days)'), { target: { value: '60' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add customer' }));
    });

    expect(m.apiRequest).toHaveBeenCalledWith(
      '/customers',
      expect.objectContaining({ method: 'POST' })
    );
    expect(await screen.findByText('Umbrella Corp')).toBeInTheDocument();
    expect(screen.getByText('alice@umbrella.com')).toBeInTheDocument();
  });

  it('deletes a customer after confirmation', async () => {
    await act(async () => {
      render(<App />);
    });
    await openCustomersTab();
    expect(await screen.findByText('Globex Ltd')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete Globex Ltd' }));
    });
    expect(screen.getByRole('dialog', { name: 'Delete customer' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });

    expect(m.apiRequest).toHaveBeenCalledWith(
      expect.stringMatching(/^\/customers\/c-1$/),
      expect.objectContaining({ method: 'DELETE' })
    );
    await act(async () => {});
    expect(screen.queryByText('Globex Ltd')).not.toBeInTheDocument();
    expect(screen.getByText('Initech')).toBeInTheDocument();
  });

  it('filters customers by search term', async () => {
    await act(async () => {
      render(<App />);
    });
    await openCustomersTab();
    expect(await screen.findByText('Globex Ltd')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'globex' } });
    });

    expect(await screen.findByText('Globex Ltd')).toBeInTheDocument();
    expect(screen.queryByText('Initech')).not.toBeInTheDocument();
    expect(m.apiRequest).toHaveBeenCalledWith(
      expect.stringContaining('search=globex'),
      expect.anything()
    );
  });
});
