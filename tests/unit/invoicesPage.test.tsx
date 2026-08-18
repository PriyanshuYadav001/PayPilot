import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from '../../client/src/App';

// Hoisted mocks: authenticated Supabase session + in-memory invoices store
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
  }

  const customers: CustomerRow[] = [
    {
      id: 'c-1',
      organizationId: 'org-1',
      companyName: 'Globex Ltd',
      contactName: 'Jane Doe',
      email: 'jane@globex.com',
    },
    {
      id: 'c-2',
      organizationId: 'org-1',
      companyName: 'Initech',
      contactName: 'Bob Smith',
      email: 'bob@initech.com',
    },
  ];

  interface InvoiceRow {
    id: string;
    organizationId: string;
    customerId: string;
    customer: CustomerRow;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    currency: string;
    subtotal: number;
    taxTotal: number;
    discount: number;
    totalAmount: number;
    amountPaid: number;
    amountDue: number;
    status: string;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
    }>;
    createdAt: string;
    updatedAt: string;
  }

  const defaultInvoices: InvoiceRow[] = [
    {
      id: 'inv-1',
      organizationId: 'org-1',
      customerId: 'c-1',
      customer: customers[0],
      invoiceNumber: 'INV-2026-001',
      issueDate: '2026-08-01',
      dueDate: '2099-12-31',
      currency: 'INR',
      subtotal: 2500,
      taxTotal: 360,
      discount: 100,
      totalAmount: 2760,
      amountPaid: 0,
      amountDue: 2760,
      status: 'draft',
      items: [
        {
          id: 'it-1',
          description: 'Service',
          quantity: 2,
          unitPrice: 1000,
          taxRate: 18,
        },
        {
          id: 'it-2',
          description: 'Setup',
          quantity: 1,
          unitPrice: 500,
          taxRate: 0,
        },
      ],
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'inv-2',
      organizationId: 'org-1',
      customerId: 'c-2',
      customer: customers[1],
      invoiceNumber: 'INV-2026-002',
      issueDate: '2026-08-05',
      dueDate: '2099-12-31',
      currency: 'INR',
      subtotal: 5000,
      taxTotal: 0,
      discount: 0,
      totalAmount: 5000,
      amountPaid: 5000,
      amountDue: 0,
      status: 'paid',
      items: [
        {
          id: 'it-3',
          description: 'Retainer',
          quantity: 1,
          unitPrice: 5000,
          taxRate: 0,
        },
      ],
      createdAt: '2026-08-05T00:00:00Z',
      updatedAt: '2026-08-05T00:00:00Z',
    },
  ];

  let invoices: InvoiceRow[] = [...defaultInvoices];

  const listeners: Array<
    (event: string, session: unknown) => void
  > = [];

  const supabase = {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: baseSession },
          error: null,
        })
      ),

      onAuthStateChange: vi.fn(
        (cb: (event: string, session: unknown) => void) => {
          listeners.push(cb);

          return {
            data: {
              subscription: {
                unsubscribe: vi.fn(),
              },
            },
          };
        }
      ),

      setSession: vi.fn(
        (s: {
          access_token: string;
          refresh_token: string;
        }) => {
          const session = {
            ...baseSession,
            access_token: s.access_token,
            refresh_token: s.refresh_token,
          };

          listeners.forEach((cb) => cb('SIGNED_IN', session));

          return Promise.resolve({
            data: { session },
            error: null,
          });
        }
      ),

      signOut: vi.fn(() => {
        listeners.forEach((cb) => cb('SIGNED_OUT', null));

        return Promise.resolve({
          error: null,
        });
      }),

      updateUser: vi.fn(() =>
        Promise.resolve({
          data: { user },
          error: null,
        })
      ),

      resetPasswordForEmail: vi.fn(() =>
        Promise.resolve({
          error: null,
        })
      ),
    },
  };

  const apiRequest = vi.fn<
    (endpoint: string, options?: unknown) => Promise<unknown>
  >(async (endpoint: string, options?: unknown) => {
    if (endpoint === '/auth/me') {
      return {
        success: true,
        data: {
          profile,
          organizations: [organization],
        },
      };
    }

    const opts = (options ?? {}) as {
      method?: string;
      body?: string;
    };

    const url = new URL(endpoint, 'http://test');

    if (url.pathname === '/customers') {
      return {
        success: true,
        data: { customers },
        pagination: {
          page: 1,
          limit: 100,
          totalCount: customers.length,
          totalPages: 1,
        },
      };
    }

    if (url.pathname === '/invoices') {
      /*
       * POST /invoices
       */
      if (opts.method === 'POST') {
        const body = JSON.parse(opts.body ?? '{}');

        const subtotal = (
          body.items as Array<{
            quantity: number;
            unitPrice: number;
          }>
        ).reduce(
          (s, i) => s + i.quantity * i.unitPrice,
          0
        );

        const taxTotal = (
          body.items as Array<{
            quantity: number;
            unitPrice: number;
            taxRate?: number;
          }>
        ).reduce(
          (s, i) =>
            s +
            i.quantity *
              i.unitPrice *
              ((i.taxRate ?? 0) / 100),
          0
        );

        const discount = body.discount ?? 0;
        const totalAmount = subtotal + taxTotal - discount;

        const customer =
          customers.find(
            (c) => c.id === body.customerId
          ) ?? customers[0];

        const invoice: InvoiceRow = {
          id: 'inv-created',
          organizationId: 'org-1',
          customerId: body.customerId,
          customer,
          invoiceNumber: body.invoiceNumber,
          issueDate: body.issueDate,
          dueDate: body.dueDate,
          currency: body.currency ?? 'INR',
          subtotal,
          taxTotal,
          discount,
          totalAmount,
          amountPaid: 0,
          amountDue: totalAmount,
          status: 'draft',

          items: (
            body.items as Array<{
              description: string;
              quantity: number;
              unitPrice: number;
              taxRate?: number;
            }>
          ).map((item, index) => ({
            id: `it-created-${index}`,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate ?? 0,
          })),

          createdAt: '2026-08-16T00:00:00Z',
          updatedAt: '2026-08-16T00:00:00Z',
        };

        invoices.push(invoice);

        return {
          success: true,
          data: { invoice },
        };
      }

      /*
       * GET /invoices
       *
       * IMPORTANT:
       * This response shape must match client/src/lib/invoices.ts:
       *
       * data: {
       *   invoices: {
       *     data: Invoice[];
       *     total: number;
       *     page: number;
       *     lastPage: number;
       *   }
       * }
       */
      const searchTerm =
        url.searchParams.get('search') ?? '';

      const status =
        url.searchParams.get('status') ?? '';

      let rows = invoices;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();

        rows = rows.filter((invoice) =>
          invoice.invoiceNumber
            .toLowerCase()
            .includes(term)
        );
      }

      if (status) {
        rows = rows.filter(
          (invoice) => invoice.status === status
        );
      }

      return {
        success: true,

        data: {
          invoices: {
            data: rows,
            total: rows.length,
            page: 1,
            lastPage: Math.max(
              1,
              Math.ceil(rows.length / 10)
            ),
          },
        },
      };
    }

    /*
     * /invoices/:id
     */
    if (url.pathname.startsWith('/invoices/')) {
      const id = url.pathname.split('/')[2];

      /*
       * DELETE /invoices/:id
       */
      if (opts.method === 'DELETE') {
        invoices = invoices.filter(
          (invoice) => invoice.id !== id
        );

        return {
          success: true,
          data: {
            message: 'Deleted',
          },
        };
      }

      /*
       * GET /invoices/:id
       */
      const invoice = invoices.find(
        (invoice) => invoice.id === id
      );

      if (invoice) {
        return {
          success: true,
          data: { invoice },
        };
      }

      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Invoice not found.',
        },
      };
    }

    return {
      success: true,
      data: {},
    };
  });

  return {
    supabase,
    apiRequest,

    resetInvoices: () => {
      invoices = [...defaultInvoices];
    },

    clearInvoices: () => {
      invoices = [];
    },
  };
});

vi.mock('../../client/src/lib/supabaseClient', () => ({
  supabase: m.supabase,
}));

vi.mock('../../client/src/lib/apiClient', () => ({
  apiRequest: m.apiRequest,
}));

async function openInvoicesTab() {
  const invoicesButton = screen.getByRole(
    'button',
    { name: /invoices/i }
  );

  await act(async () => {
    fireEvent.click(invoicesButton);
  });
}

describe('Invoices Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resetInvoices();
  });

  it('renders the invoice list from the API', async () => {
    await act(async () => {
      render(<App />);
    });

    await openInvoicesTab();

    expect(
      await screen.findByText('INV-2026-001')
    ).toBeInTheDocument();

    expect(
      screen.getByText('INV-2026-002')
    ).toBeInTheDocument();

    expect(
      screen.getByText('Globex Ltd')
    ).toBeInTheDocument();

    expect(
      screen.getByText('Initech')
    ).toBeInTheDocument();

    expect(m.apiRequest).toHaveBeenCalledWith(
      expect.stringMatching(/^\/invoices\?/),
      expect.objectContaining({
        orgId: 'org-1',
      })
    );
  });

  it('shows the empty state when there are no invoices', async () => {
    m.clearInvoices();

    await act(async () => {
      render(<App />);
    });

    await openInvoicesTab();

    expect(
      await screen.findByText('No invoices yet')
    ).toBeInTheDocument();
  });

  it('creates a new invoice through the modal', async () => {
    await act(async () => {
      render(<App />);
    });

    await openInvoicesTab();

    expect(
      await screen.findByText('INV-2026-001')
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'New Invoice',
        })
      );
    });

    await act(async () => {
      fireEvent.change(
        screen.getByLabelText('Customer'),
        {
          target: { value: 'c-1' },
        }
      );

      fireEvent.change(
        screen.getByLabelText('Invoice number'),
        {
          target: { value: 'INV-2026-003' },
        }
      );

      fireEvent.change(
        screen.getByLabelText('Issue date'),
        {
          target: { value: '2026-08-16' },
        }
      );

      fireEvent.change(
        screen.getByLabelText('Due date'),
        {
          target: { value: '2099-12-31' },
        }
      );

      fireEvent.change(
        screen.getByLabelText('Discount'),
        {
          target: { value: '100' },
        }
      );

      fireEvent.change(
        screen.getAllByLabelText(
          'Item description'
        )[0],
        {
          target: { value: 'Service' },
        }
      );

      fireEvent.change(
        screen.getAllByLabelText('Quantity')[0],
        {
          target: { value: '2' },
        }
      );

      fireEvent.change(
        screen.getAllByLabelText('Unit price')[0],
        {
          target: { value: '1000' },
        }
      );

      fireEvent.change(
        screen.getAllByLabelText('Tax rate %')[0],
        {
          target: { value: '18' },
        }
      );

      fireEvent.change(
        screen.getByLabelText('Notes'),
        {
          target: { value: 'Net 30' },
        }
      );
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Create invoice',
        })
      );
    });

    expect(m.apiRequest).toHaveBeenCalledWith(
      '/invoices',
      expect.objectContaining({
        method: 'POST',
      })
    );

    const postCall = m.apiRequest.mock.calls.find(
      (call) =>
        call[0] === '/invoices' &&
        (call[1] as { method?: string })?.method ===
          'POST'
    ) as
      | [
          string,
          {
            method?: string;
            body?: string;
          }
        ]
      | undefined;

    const body = JSON.parse(
      postCall?.[1]?.body ?? '{}'
    );

    expect(body.items[0]).toEqual(
      expect.objectContaining({
        description: 'Service',
        quantity: 2,
        unitPrice: 1000,
        taxRate: 18,
      })
    );

    expect(
      await screen.findByText('INV-2026-003')
    ).toBeInTheDocument();
  });

  it('deletes an invoice after confirmation', async () => {
    await act(async () => {
      render(<App />);
    });

    await openInvoicesTab();

    expect(
      await screen.findByText('INV-2026-001')
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Delete INV-2026-001',
        })
      );
    });

    expect(
      screen.getByRole('dialog', {
        name: 'Delete invoice',
      })
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Delete',
        })
      );
    });

    expect(m.apiRequest).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/invoices\/inv-1$/
      ),
      expect.objectContaining({
        method: 'DELETE',
      })
    );

    await act(async () => {});

    expect(
      screen.queryByText('INV-2026-001')
    ).not.toBeInTheDocument();

    expect(
      screen.getByText('INV-2026-002')
    ).toBeInTheDocument();
  });

  it('filters invoices by search term', async () => {
    await act(async () => {
      render(<App />);
    });

    await openInvoicesTab();

    expect(
      await screen.findByText('INV-2026-001')
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(
        screen.getByLabelText('Search invoices'),
        {
          target: { value: '002' },
        }
      );
    });

    expect(
      await screen.findByText('INV-2026-002')
    ).toBeInTheDocument();

    expect(
      screen.queryByText('INV-2026-001')
    ).not.toBeInTheDocument();

    expect(m.apiRequest).toHaveBeenCalledWith(
      expect.stringContaining('search=002'),
      expect.anything()
    );
  });

  it('filters invoices by status', async () => {
    await act(async () => {
      render(<App />);
    });

    await openInvoicesTab();

    expect(
      await screen.findByText('INV-2026-001')
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(
        screen.getByLabelText('Filter by status'),
        {
          target: { value: 'paid' },
        }
      );
    });

    expect(
      await screen.findByText('INV-2026-002')
    ).toBeInTheDocument();

    expect(
      screen.queryByText('INV-2026-001')
    ).not.toBeInTheDocument();

    expect(m.apiRequest).toHaveBeenCalledWith(
      expect.stringContaining('status=paid'),
      expect.anything()
    );
  });
});