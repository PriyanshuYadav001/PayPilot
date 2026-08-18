import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMessage = vi.fn();
const mockRecordCommunication = vi.fn();
const mockSupabaseFrom = vi.fn();
const mockInitiateCall = vi.fn();
const mockGetCallStatus = vi.fn();
const mockGetCallRecording = vi.fn();

vi.mock('../../server/lib/supabaseClient', () => ({
  supabaseServer: { from: (...args: unknown[]) => mockSupabaseFrom(...args) },
}));

vi.mock('../../server/services/communication/communicationService', () => ({
  communicationService: {
    sendMessage: mockSendMessage,
    recordCommunication: mockRecordCommunication,
  },
}));

vi.mock('../../server/services/calls/CallProvider', () => ({
  getCallProvider: () => ({
    initiateCall: mockInitiateCall,
    getCallStatus: mockGetCallStatus,
    getCallRecording: mockGetCallRecording,
  }),
  registerCallProvider: vi.fn(),
  clearCallProvider: vi.fn(),
}));

const TEST_ORG = '11111111-1111-1111-1111-111111111111';
const TEST_CUST = '22222222-2222-2222-2222-222222222222';
const TEST_INV = '33333333-3333-3333-3333-333333333333';
const TEST_CALL_ID = '55555555-5555-5555-5555-555555555555';

const mockCallRow = {
  id: TEST_CALL_ID,
  organization_id: TEST_ORG,
  customer_id: TEST_CUST,
  invoice_id: TEST_INV,
  follow_up_task_id: null,
  provider: 'exotel',
  provider_call_id: 'prov-call-123',
  from_number: '+911234567890',
  to_number: '+919876543210',
  status: 'completed',
  duration_seconds: 120,
  recording_url: 'https://recording.test/call1',
  transcript: 'Customer said they will pay by Friday',
  summary: null,
  metadata: {},
  started_at: '2026-08-17T10:00:00Z',
  ended_at: '2026-08-17T10:02:00Z',
  created_at: '2026-08-17T10:00:00Z',
};

function mockChain(finalResult: { data: unknown; error: null | { message: string }; count?: number }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(finalResult));
  chain.maybeSingle = vi.fn(() => Promise.resolve(finalResult));
  chain.then = vi.fn((onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(finalResult).then(onFulfilled),
  );
  return chain;
}

describe('Call Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordCommunication.mockResolvedValue({ id: 'comm-1' });
  });

  describe('createCall', () => {
    it('creates a call record and initiates via provider', async () => {
      mockInitiateCall.mockResolvedValue({
        providerCallId: 'prov-call-123',
        status: 'queued',
        timestamp: new Date(),
      });

      // Mock org query for from_number
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'organizations') {
          return mockChain({ data: { support_phone: '+911234567890' }, error: null });
        }
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { callService } = await import('../../server/services/calls/callService');
      const call = await callService.createCall({
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
        to: '+919876543210',
        scriptText: 'Payment reminder',
      });

      expect(call).not.toBeNull();
      expect(call.id).toBe(TEST_CALL_ID);
      expect(mockInitiateCall).toHaveBeenCalledOnce();
    });

    it('throws when no from number is configured', async () => {
      mockSupabaseFrom.mockImplementation(() =>
        mockChain({ data: { support_phone: null }, error: null }),
      );

      const { callService } = await import('../../server/services/calls/callService');
      await expect(
        callService.createCall({
          organizationId: TEST_ORG,
          customerId: TEST_CUST,
          to: '+919876543210',
        }),
      ).rejects.toThrow('No from number configured');
    });
  });

  describe('getCallStatus', () => {
    it('returns call and updates status from provider', async () => {
      mockGetCallStatus.mockResolvedValue({
        providerCallId: 'prov-call-123',
        status: 'completed',
        startedAt: new Date('2026-08-17T10:00:00Z'),
        endedAt: new Date('2026-08-17T10:02:00Z'),
        durationSeconds: 120,
      });

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          const chain = mockChain({ data: mockCallRow, error: null });
          chain.single = vi.fn().mockResolvedValue({ data: { ...mockCallRow, status: 'completed' }, error: null });
          return chain;
        }
        return mockChain({ data: null, error: null });
      });

      const { callService } = await import('../../server/services/calls/callService');
      const call = await callService.getCallStatus(TEST_CALL_ID, TEST_ORG);

      expect(call).not.toBeNull();
      expect(call!.status).toBe('completed');
    });

    it('returns null when call not found', async () => {
      mockSupabaseFrom.mockImplementation(() =>
        mockChain({ data: null, error: null }),
      );

      const { callService } = await import('../../server/services/calls/callService');
      const call = await callService.getCallStatus('nonexistent', TEST_ORG);
      expect(call).toBeNull();
    });
  });

  describe('getCallResult', () => {
    it('fetches recording and transcript for completed calls', async () => {
      mockGetCallRecording.mockResolvedValue({
        providerCallId: 'prov-call-123',
        recordingUrl: 'https://recording.test/call1',
        durationSeconds: 120,
        transcript: 'Customer said they will pay by Friday',
      });

      const callWithoutTranscript = { ...mockCallRow, transcript: null };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          const chain = mockChain({ data: callWithoutTranscript, error: null });
          chain.single = vi.fn().mockResolvedValue({
            data: { ...callWithoutTranscript, transcript: 'Customer said they will pay by Friday' },
            error: null,
          });
          return chain;
        }
        return mockChain({ data: null, error: null });
      });

      const { callService } = await import('../../server/services/calls/callService');
      const call = await callService.getCallResult(TEST_CALL_ID, TEST_ORG);

      expect(call).not.toBeNull();
      expect(mockGetCallRecording).toHaveBeenCalledWith('prov-call-123');
    });

    it('skips recording fetch when transcript already exists', async () => {
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { callService } = await import('../../server/services/calls/callService');
      const call = await callService.getCallResult(TEST_CALL_ID, TEST_ORG);

      expect(call).not.toBeNull();
      expect(mockGetCallRecording).not.toHaveBeenCalled();
    });
  });

  describe('listCalls', () => {
    it('returns paginated calls', async () => {
      mockSupabaseFrom.mockImplementation(() =>
        mockChain({ data: [mockCallRow], error: null, count: 1 }),
      );

      const { callService } = await import('../../server/services/calls/callService');
      const result = await callService.listCalls(TEST_ORG, { page: 1, limit: 20 });

      expect(result.calls).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });
  });
});

