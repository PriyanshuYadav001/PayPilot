import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn().mockResolvedValue({ id: 'comm-1' }),
}));

vi.mock('../../server/services/communication/communicationService', () => ({
  communicationService: { sendMessage: mocks.sendMessage },
}));

/**
 * Smart mock for supabaseServer that supports:
 * - List queries (via .then() auto-resolution) returning _listRows
 * - Single queries (via .single()/.maybeSingle()) returning .single
 * - Inserts with auto-resolution
 * - Updates and deletes
 *
 * Each from() call creates an independent chain with its own insertData/updateData.
 * To support multiple sequential queries on the same table, use a result queue:
 *   tables[table] = { _resultQueue: [result1, result2, ...] }
 * Each from() call shifts the next result from the queue.
 */
const m = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>> = {};

  function makeChain(table: string) {
    const cfg = tables[table] ?? {};

    // Support result queue for multiple sequential queries on same table
    const queue = cfg._resultQueue as Array<Record<string, unknown>> | undefined;
    const queuedResult = queue && queue.length > 0 ? queue.shift() : null;

    let insertData: unknown = null;
    let updateData: unknown = null;
    let deleteMode = false;
    let selectCountMode = false;

    function resolveSingle() {
      if (queuedResult) return queuedResult;
      if (insertData) return { data: { id: 'gen-id', ...insertData as object }, error: null };
      if (updateData) return { data: { id: 'existing-id', ...updateData as object }, error: null };
      if (deleteMode) return { data: cfg.single ?? null, error: null };
      return { data: cfg.single ?? null, error: cfg.singleError ?? null };
    }

    function resolveList() {
      if (queuedResult) return queuedResult;
      const rows = (cfg._listRows as unknown[]) ?? [];
      if (selectCountMode) {
        return { data: rows, count: rows.length, error: null };
      }
      return { data: rows, error: null };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};

    chain.insert = (data: unknown) => { insertData = data; return chain; };
    chain.update = (data: unknown) => { updateData = data; return chain; };
    chain.delete = () => { deleteMode = true; return chain; };
    chain.select = (_cols?: unknown, opts?: { count?: string }) => {
      if (opts?.count === 'exact') selectCountMode = true;
      return chain;
    };
    chain.eq = () => chain;
    chain.neq = () => chain;
    chain.in = () => chain;
    chain.or = () => chain;
    chain.gte = () => chain;
    chain.lte = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.single = () => Promise.resolve(resolveSingle());
    chain.maybeSingle = () => Promise.resolve(resolveSingle());

    // Auto-resolve when the chain is awaited directly (list query or bare insert)
    chain.then = (onFulfilled: (v: unknown) => unknown) => {
      // If insertData is set, this is a bare insert without .select()
      if (insertData) return Promise.resolve(resolveSingle()).then(onFulfilled);
      // Otherwise it's a list query
      return Promise.resolve(resolveList()).then(onFulfilled);
    };

    return chain;
  }

  const from = vi.fn((table: string) => makeChain(table));

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

const mockCreatePaymentLink = vi.fn();
vi.mock('../../server/services/payment/paymentService', () => ({
  createPaymentLink: (...args: unknown[]) => mockCreatePaymentLink(...args),
}));

import { matchRulesAndCreateTasks } from '../../server/services/followup/ruleMatcher';
import { processPendingTasks } from '../../server/services/followup/taskExecutor';

const ORG_ID = '123e4567-e89b-42d3-a456-426614174000';
const INVOICE_ID = '123e4567-e89b-42d3-a456-426614174001';
const CUSTOMER_ID = '123e4567-e89b-42d3-a456-426614174002';
const RULE_ID = '123e4567-e89b-42d3-a456-426614174003';
const TASK_ID = '123e4567-e89b-42d3-a456-426614174004';

describe('Follow-Up Automation Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.tables.follow_up_rules = { single: null };
    m.tables.follow_up_tasks = { single: null };
    m.tables.invoices = { single: null };
    m.tables.customers = { single: null };
    m.tables.organizations = { single: null };
    m.tables.payment_links = { single: null };
    mockCreatePaymentLink.mockResolvedValue({ shortUrl: 'https://pay.test/abc' });
  });

  describe('Rule Matcher', () => {
    it('creates tasks when rules match invoice offsets', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);
      const dueDate = futureDate.toISOString().split('T')[0];

      // Set up result queue for follow_up_tasks:
      // 1st call: idempotency check (maybeSingle) → no existing task
      // 2nd call: insert → success
      m.tables.follow_up_tasks = {
        single: null,
        _resultQueue: [
          { data: null, error: null }, // idempotency check returns null
          { data: { id: 'new-task' }, error: null }, // insert succeeds
        ],
      };

      m.tables.follow_up_rules = {
        single: null,
        _listRows: [{
          id: RULE_ID,
          organization_id: ORG_ID,
          name: 'Upcoming Due Reminder',
          is_active: true,
          days_relative_to_due: -3,
          channel: 'email',
          template_subject: 'Invoice Due Soon',
          template_body: 'Hello {{contact_name}}, invoice {{invoice_number}} is due soon.',
          escalation_priority: 1,
          include_payment_link: true,
          include_qr_code: true,
        }],
      };

      m.tables.invoices = {
        single: null,
        _listRows: [{
          id: INVOICE_ID,
          organization_id: ORG_ID,
          customer_id: CUSTOMER_ID,
          invoice_number: 'INV-001',
          due_date: dueDate,
          amount_due: 1180,
          currency: 'INR',
          status: 'sent',
          is_follow_up_active: true,
          follow_up_paused_until: null,
          customer: { contact_name: 'Jane Doe', company_name: 'Globex', is_dnd: false },
        }],
      };

      const count = await matchRulesAndCreateTasks();
      expect(count).toBe(1);
    });

    it('does not create duplicate tasks', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);
      const dueDate = futureDate.toISOString().split('T')[0];

      // Idempotency check returns existing task
      m.tables.follow_up_tasks = {
        single: null,
        _resultQueue: [
          { data: { id: 'existing-task' }, error: null }, // duplicate found
        ],
      };

      m.tables.follow_up_rules = {
        single: null,
        _listRows: [{
          id: RULE_ID,
          organization_id: ORG_ID,
          name: 'Upcoming Due Reminder',
          is_active: true,
          days_relative_to_due: -3,
          channel: 'email',
          template_subject: 'Subject',
          template_body: 'Body',
          escalation_priority: 1,
          include_payment_link: false,
          include_qr_code: false,
        }],
      };

      m.tables.invoices = {
        single: null,
        _listRows: [{
          id: INVOICE_ID,
          organization_id: ORG_ID,
          customer_id: CUSTOMER_ID,
          invoice_number: 'INV-001',
          due_date: dueDate,
          amount_due: 1000,
          currency: 'INR',
          status: 'sent',
          is_follow_up_active: true,
          follow_up_paused_until: null,
          customer: { contact_name: 'Jane', company_name: 'Acme', is_dnd: false },
        }],
      };

      const count = await matchRulesAndCreateTasks();
      expect(count).toBe(0);
    });

    it('skips DND customers', async () => {
      const today = new Date().toISOString().split('T')[0];

      m.tables.follow_up_rules = {
        single: null,
        _listRows: [{
          id: RULE_ID,
          organization_id: ORG_ID,
          name: 'Reminder',
          is_active: true,
          days_relative_to_due: 0,
          channel: 'email',
          template_body: 'Pay now',
          escalation_priority: 1,
          include_payment_link: false,
          include_qr_code: false,
        }],
      };

      m.tables.invoices = {
        single: null,
        _listRows: [{
          id: INVOICE_ID,
          organization_id: ORG_ID,
          customer_id: CUSTOMER_ID,
          invoice_number: 'INV-002',
          due_date: today,
          amount_due: 500,
          currency: 'INR',
          status: 'overdue',
          is_follow_up_active: true,
          follow_up_paused_until: null,
          customer: { contact_name: 'Bob', company_name: 'Corp', is_dnd: true },
        }],
      };

      m.tables.follow_up_tasks = { single: null };

      const count = await matchRulesAndCreateTasks();
      expect(count).toBe(0);
    });

    it('returns 0 when no active rules exist', async () => {
      m.tables.follow_up_rules = { single: null, _listRows: [] };
      const count = await matchRulesAndCreateTasks();
      expect(count).toBe(0);
    });
  });

  describe('Task Executor', () => {
    it('processes pending tasks and marks them completed', async () => {
      // claimPendingTasks: select candidates → 1 task, then atomic update → claimed
      m.tables.follow_up_tasks = {
        single: { id: TASK_ID, status: 'pending' },
        _resultQueue: [
          // claimPendingTasks: select candidates list
          { data: [{ id: TASK_ID }], error: null },
          // claimPendingTasks: atomic update (maybeSingle for claim)
          { data: { id: TASK_ID, status: 'processing', retry_count: 0, max_retries: 3, metadata: {}, organization_id: ORG_ID, invoice_id: INVOICE_ID, rule_id: RULE_ID, channel: 'email', scheduled_for: new Date().toISOString() }, error: null },
          // markTaskCompleted
          { data: null, error: null },
          // updateInvoiceFollowUpTimestamp
          { data: null, error: null },
        ],
      };

      m.tables.invoices = {
        single: {
          id: INVOICE_ID,
          organization_id: ORG_ID,
          customer_id: CUSTOMER_ID,
          invoice_number: 'INV-001',
          due_date: '2026-09-01',
          amount_due: 1180,
          currency: 'INR',
          status: 'sent',
          is_follow_up_active: true,
        },
      };

      m.tables.customers = {
        single: {
          id: CUSTOMER_ID,
          email: 'jane@globex.com',
          phone: '+919876543210',
          whatsapp_number: null,
          contact_name: 'Jane',
          company_name: 'Globex',
          is_dnd: false,
        },
      };

      m.tables.organizations = { single: { id: ORG_ID, name: 'Globex Inc' } };

      m.tables.follow_up_rules = {
        single: {
          id: RULE_ID,
          template_subject: 'Reminder',
          template_body: 'Pay invoice {{invoice_number}} for {{amount}}',
          include_payment_link: false,
        },
      };

      m.tables.payment_links = { single: null };

      const count = await processPendingTasks();
      expect(count).toBe(1);
      expect(mocks.sendMessage).toHaveBeenCalled();
    });

    it('cancels tasks for paid invoices', async () => {
      m.tables.follow_up_tasks = {
        single: { id: TASK_ID, status: 'pending' },
        _resultQueue: [
          { data: [{ id: TASK_ID }], error: null },
          { data: { id: TASK_ID, status: 'processing', retry_count: 0, max_retries: 3, metadata: {}, organization_id: ORG_ID, invoice_id: INVOICE_ID, rule_id: null, channel: 'email', scheduled_for: new Date().toISOString() }, error: null },
          // cancel update
          { data: null, error: null },
        ],
      };

      m.tables.invoices = {
        single: {
          id: INVOICE_ID,
          organization_id: ORG_ID,
          customer_id: CUSTOMER_ID,
          invoice_number: 'INV-001',
          due_date: '2026-09-01',
          amount_due: 0,
          currency: 'INR',
          status: 'paid',
          is_follow_up_active: false,
        },
      };

      const count = await processPendingTasks();
      expect(count).toBe(1);
      expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('returns 0 when no pending tasks exist', async () => {
      m.tables.follow_up_tasks = { single: null, _resultQueue: [{ data: [], error: null }] };
      const count = await processPendingTasks();
      expect(count).toBe(0);
    });
  });

  describe('Template Renderer', () => {
    it('replaces variables correctly', async () => {
      const { renderTemplate } = await import('../../server/services/followup/templateRenderer');
      const result = renderTemplate(
        'Hello {{contact_name}}, invoice {{invoice_number}} for {{amount}} is due on {{due_date}}.',
        {
          contactName: 'Jane',
          companyName: 'Globex',
          invoiceNumber: 'INV-001',
          amount: 'INR 1,180.00',
          dueDate: 'September 1, 2026',
          paymentLink: 'https://pay.test/abc',
        },
      );
      expect(result).toBe('Hello Jane, invoice INV-001 for INR 1,180.00 is due on September 1, 2026.');
    });

    it('leaves unmatched variables as-is', async () => {
      const { renderTemplate } = await import('../../server/services/followup/templateRenderer');
      const result = renderTemplate('Hello {{unknown_var}}!', {
        contactName: 'Jane',
        companyName: 'Globex',
        invoiceNumber: 'INV-001',
        amount: 'INR 100',
        dueDate: 'Jan 1',
        paymentLink: '',
      });
      expect(result).toBe('Hello {{unknown_var}}!');
    });
  });
});
