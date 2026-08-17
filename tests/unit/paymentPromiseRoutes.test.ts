import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listPromises,
  getPromise,
  createPromise,
  updatePromise,
  deletePromise,
  checkMissedPromises,
} from '../../server/services/paymentPromiseService';

const TEST_ORG_ID = '11111111-1111-1111-1111-111111111111';
const TEST_PROMISE_ID = '22222222-2222-2222-2222-222222222222';
const TEST_INVOICE_ID = '33333333-3333-3333-3333-333333333333';
const TEST_CUSTOMER_ID = '44444444-4444-4444-4444-444444444444';

const mockPromiseRow = {
  id: TEST_PROMISE_ID,
  organization_id: TEST_ORG_ID,
  invoice_id: TEST_INVOICE_ID,
  customer_id: TEST_CUSTOMER_ID,
  communication_id: null,
  promised_date: '2026-08-20',
  promised_amount: 5000,
  confidence_score: null,
  status: 'pending',
  source: 'manual',
  ai_extracted_quote: null,
  notes: 'Customer called to promise payment',
  resolved_at: null,
  created_at: '2026-08-15T10:00:00Z',
  updated_at: '2026-08-15T10:00:00Z',
};

vi.mock('../../server/lib/supabaseClient', () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

const { supabaseServer } = await import('../../server/lib/supabaseClient');

function setupMockChain(finalResult: { data: unknown; error: null; count?: number }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(finalResult));
  chain.maybeSingle = vi.fn(() => Promise.resolve(finalResult));
  chain.then = vi.fn((onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(finalResult).then(onFulfilled),
  );
  return chain;
}

describe('PaymentPromiseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPromises', () => {
    it('returns promises with pagination metadata', async () => {
      const chain = setupMockChain({
        data: [mockPromiseRow],
        error: null,
        count: 1,
      });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      const result = await listPromises(TEST_ORG_ID, {
        page: 1,
        limit: 20,
        sortBy: 'promised_date',
        sortOrder: 'asc',
      });

      expect(result.promises).toHaveLength(1);
      expect(result.promises[0].id).toBe(TEST_PROMISE_ID);
      expect(result.totalCount).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.page).toBe(1);
    });

    it('applies status filter when provided', async () => {
      const chain = setupMockChain({ data: [], error: null, count: 0 });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      await listPromises(TEST_ORG_ID, {
        page: 1,
        limit: 20,
        status: 'missed',
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      expect(chain.eq).toHaveBeenCalledWith('status', 'missed');
    });

    it('applies customerId filter when provided', async () => {
      const chain = setupMockChain({ data: [], error: null, count: 0 });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      await listPromises(TEST_ORG_ID, {
        page: 1,
        limit: 20,
        customerId: TEST_CUSTOMER_ID,
        sortBy: 'promised_date',
        sortOrder: 'asc',
      });

      expect(chain.eq).toHaveBeenCalledWith('customer_id', TEST_CUSTOMER_ID);
    });
  });

  describe('getPromise', () => {
    it('returns a promise by id', async () => {
      const chain = setupMockChain({ data: mockPromiseRow, error: null });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      const result = await getPromise(TEST_ORG_ID, TEST_PROMISE_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(TEST_PROMISE_ID);
      expect(result!.status).toBe('pending');
      expect(result!.source).toBe('manual');
    });

    it('returns null when promise not found', async () => {
      const chain = setupMockChain({ data: null, error: null });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      const result = await getPromise(TEST_ORG_ID, 'nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('createPromise', () => {
    it('creates and returns a new promise', async () => {
      const chain = setupMockChain({ data: mockPromiseRow, error: null });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      const result = await createPromise(TEST_ORG_ID, {
        invoiceId: TEST_INVOICE_ID,
        customerId: TEST_CUSTOMER_ID,
        promisedDate: '2026-08-20',
        promisedAmount: 5000,
        notes: 'Customer promised to pay',
      });

      expect(result.id).toBe(TEST_PROMISE_ID);
      expect(result.status).toBe('pending');
      expect(chain.insert).toHaveBeenCalled();
    });
  });

  describe('updatePromise', () => {
    it('updates status to fulfilled', async () => {
      const updatedRow = { ...mockPromiseRow, status: 'fulfilled', resolved_at: '2026-08-20T12:00:00Z' };
      const chain = setupMockChain({ data: updatedRow, error: null });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      const result = await updatePromise(TEST_ORG_ID, TEST_PROMISE_ID, {
        status: 'fulfilled',
        resolvedAt: '2026-08-20T12:00:00Z',
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('fulfilled');
      expect(chain.update).toHaveBeenCalled();
    });

    it('returns null when no fields provided', async () => {
      const result = await updatePromise(TEST_ORG_ID, TEST_PROMISE_ID, {});
      expect(result).toBeNull();
    });
  });

  describe('deletePromise', () => {
    it('deletes and returns the promise', async () => {
      const chain = setupMockChain({ data: mockPromiseRow, error: null });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      const result = await deletePromise(TEST_ORG_ID, TEST_PROMISE_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(TEST_PROMISE_ID);
      expect(chain.delete).toHaveBeenCalled();
    });
  });

  describe('checkMissedPromises', () => {
    it('returns 0 when no missed promises exist', async () => {
      const chain = setupMockChain({ data: [], error: null });
      vi.mocked(supabaseServer.from).mockReturnValue(chain as unknown as ReturnType<typeof supabaseServer.from>);

      const count = await checkMissedPromises();
      expect(count).toBe(0);
    });

    it('marks overdue promise as missed and creates follow-up task', async () => {
      const overdueRow = { ...mockPromiseRow, promised_date: '2026-08-10', created_at: '2026-08-01T10:00:00Z' };

      let callIndex = 0;
      vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
        callIndex++;
        if (table === 'payment_promises' && callIndex === 1) {
          // Query for missed promises
          return setupMockChain({ data: [overdueRow], error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        if (table === 'payments') {
          // No payments found
          return setupMockChain({ data: [], error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        if (table === 'payment_promises' && callIndex === 3) {
          // Update to missed
          return setupMockChain({ data: { ...overdueRow, status: 'missed' }, error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        if (table === 'follow_up_tasks') {
          // Check for duplicate (none found) then insert
          if (callIndex === 4) {
            return setupMockChain({ data: null, error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
          }
          return setupMockChain({ data: { id: 'task-1' }, error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        return setupMockChain({ data: null, error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
      });

      const count = await checkMissedPromises();
      expect(count).toBe(1);
    });

    it('skips promise when payment already received', async () => {
      const overdueRow = { ...mockPromiseRow, promised_date: '2026-08-10', created_at: '2026-08-01T10:00:00Z' };

      let callIndex = 0;
      vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
        callIndex++;
        if (table === 'payment_promises' && callIndex === 1) {
          return setupMockChain({ data: [overdueRow], error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        if (table === 'payments') {
          // Payment found — should fulfill, not miss
          return setupMockChain({ data: [{ id: 'pay-1' }], error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        // Update to fulfilled
        return setupMockChain({ data: { ...overdueRow, status: 'fulfilled' }, error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
      });

      const count = await checkMissedPromises();
      expect(count).toBe(0);
    });

    it('prevents duplicate follow-up tasks', async () => {
      const overdueRow = { ...mockPromiseRow, promised_date: '2026-08-10', created_at: '2026-08-01T10:00:00Z' };

      let callIndex = 0;
      vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
        callIndex++;
        if (table === 'payment_promises' && callIndex === 1) {
          return setupMockChain({ data: [overdueRow], error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        if (table === 'payments') {
          return setupMockChain({ data: [], error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        if (table === 'payment_promises' && callIndex === 3) {
          return setupMockChain({ data: { ...overdueRow, status: 'missed' }, error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        if (table === 'follow_up_tasks') {
          // Duplicate task already exists
          return setupMockChain({ data: { id: 'existing-task' }, error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
        }
        return setupMockChain({ data: null, error: null }) as unknown as ReturnType<typeof supabaseServer.from>;
      });

      const count = await checkMissedPromises();
      expect(count).toBe(0);
    });
  });
});
