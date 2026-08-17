import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnalyzeTranscript = vi.fn();
const mockRecordCommunication = vi.fn();
const mockSupabaseFrom = vi.fn();
const mockGetCallRecording = vi.fn();
const mockCreatePromise = vi.fn();
const mockUpdatePromise = vi.fn();
const mockFindPendingPromiseForInvoice = vi.fn();

vi.mock('../../server/lib/supabaseClient', () => ({
  supabaseServer: { from: (...args: unknown[]) => mockSupabaseFrom(...args) },
}));

vi.mock('../../server/services/communication/communicationService', () => ({
  communicationService: {
    sendMessage: vi.fn(),
    recordCommunication: mockRecordCommunication,
  },
}));

vi.mock('../../server/services/calls/CallProvider', () => ({
  getCallProvider: () => ({
    initiateCall: vi.fn(),
    getCallStatus: vi.fn(),
    getCallRecording: mockGetCallRecording,
  }),
  registerCallProvider: vi.fn(),
  clearCallProvider: vi.fn(),
}));

vi.mock('../../server/services/calls/transcriptAnalyzer', () => ({
  transcriptAnalyzer: {
    analyzeTranscript: mockAnalyzeTranscript,
  },
}));

vi.mock('../../server/services/paymentPromiseService', () => ({
  paymentPromiseService: {
    createPromise: mockCreatePromise,
    updatePromise: mockUpdatePromise,
    findPendingPromiseForInvoice: mockFindPendingPromiseForInvoice,
    deletePromise: vi.fn(),
    listPromises: vi.fn(),
    getPromise: vi.fn(),
    checkMissedPromises: vi.fn(),
  },
}));

const TEST_ORG = '11111111-1111-1111-1111-111111111111';
const TEST_CUST = '22222222-2222-2222-2222-222222222222';
const TEST_INV = '33333333-3333-3333-3333-333333333333';
const TEST_CALL_ID = '55555555-5555-5555-5555-555555555555';

function mockChain(finalResult: { data: unknown; error: null | { message: string }; count?: number }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(finalResult));
  chain.maybeSingle = vi.fn(() => Promise.resolve(finalResult));
  chain.then = vi.fn((onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(finalResult).then(onFulfilled),
  );
  return chain;
}

const transcript = 'Agent: Hello, this is regarding invoice INV-001 for 25000 INR.\nCustomer: Yes, I know about it. I will pay by this Friday.\nAgent: Great, can you confirm the date?\nCustomer: August 22, 2026. Also, there seems to be a tax calculation issue on line item 3.';

const mockCallRow = {
  id: TEST_CALL_ID,
  organization_id: TEST_ORG,
  customer_id: TEST_CUST,
  invoice_id: TEST_INV,
  follow_up_task_id: null,
  provider: 'custom',
  provider_call_id: 'prov-call-123',
  from_number: '+911234567890',
  to_number: '+919876543210',
  status: 'completed',
  duration_seconds: 120,
  recording_url: 'https://recording.test/call1',
  transcript,
  summary: null,
  metadata: {},
  started_at: '2026-08-17T10:00:00Z',
  ended_at: '2026-08-17T10:02:00Z',
  created_at: '2026-08-17T10:00:00Z',
};

const mockAnalysisResult = {
  analysis: {
    primaryIntent: 'PAYMENT_PROMISE',
    sentiment: 'neutral',
    confidence: 0.88,
    summary: 'Customer confirms payment by Aug 22 and reports a tax calculation issue.',
    extractedPromises: [
      {
        promisedDate: '2026-08-22',
        promisedAmount: 25000,
        confidence: 0.92,
        quote: 'I will pay by this Friday... August 22, 2026',
      },
    ],
    extractedDisputes: [
      {
        category: 'tax_error',
        reason: 'Tax calculation appears incorrect on line item 3',
        confidence: 0.85,
        quote: 'there seems to be a tax calculation issue on line item 3',
      },
    ],
    customerConcerns: [],
    injectionDetected: false,
    warnings: [],
  },
  injectionDetected: false,
};

describe('Transcript Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordCommunication.mockResolvedValue({ id: 'comm-1' });
    mockCreatePromise.mockResolvedValue({
      id: 'promise-1',
      organizationId: TEST_ORG,
      invoiceId: TEST_INV,
      customerId: TEST_CUST,
      promisedDate: '2026-08-22',
      promisedAmount: 25000,
      status: 'pending',
      source: 'ai_transcript',
    });
    mockFindPendingPromiseForInvoice.mockResolvedValue(null);
  });

  describe('processCompletedCall — full transcript analysis', () => {
    it('analyzes transcript and creates both promise and dispute', async () => {
      mockAnalyzeTranscript.mockResolvedValue(mockAnalysisResult);

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          const chain = mockChain({ data: mockCallRow, error: null });
          chain.single = vi.fn().mockResolvedValue({ data: { ...mockCallRow }, error: null });
          return chain;
        }
        if (table === 'disputes') {
          return mockChain({ data: { id: 'dispute-1' }, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(result.transcriptFound).toBe(true);
      expect(result.analysis).not.toBeNull();
      expect(result.analysis!.primaryIntent).toBe('PAYMENT_PROMISE');
      expect(result.analysis!.promiseCount).toBe(1);
      expect(result.analysis!.disputeCount).toBe(1);
      expect(result.analysis!.concernCount).toBe(0);
      expect(result.analysis!.injectionDetected).toBe(false);
      expect(mockAnalyzeTranscript).toHaveBeenCalledWith(
        expect.objectContaining({ transcript }),
      );
      expect(mockCreatePromise).toHaveBeenCalledOnce();
    });

    it('updates existing pending promise instead of creating duplicate', async () => {
      mockAnalyzeTranscript.mockResolvedValue(mockAnalysisResult);

      const existingPromise = {
        id: 'existing-promise-1',
        organizationId: TEST_ORG,
        invoiceId: TEST_INV,
        customerId: TEST_CUST,
        promisedDate: '2026-08-20',
        status: 'pending',
        source: 'manual',
      };
      mockFindPendingPromiseForInvoice.mockResolvedValue(existingPromise);
      mockUpdatePromise.mockResolvedValue({ ...existingPromise, promisedDate: '2026-08-22' });

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        if (table === 'disputes') {
          return mockChain({ data: { id: 'dispute-1' }, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(result.analysis!.promiseCount).toBe(1);
      expect(mockUpdatePromise).toHaveBeenCalledOnce();
      expect(mockCreatePromise).not.toHaveBeenCalled();
    });

    it('creates promise when no existing pending promise', async () => {
      mockAnalyzeTranscript.mockResolvedValue(mockAnalysisResult);
      mockFindPendingPromiseForInvoice.mockResolvedValue(null);

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        if (table === 'disputes') {
          return mockChain({ data: { id: 'dispute-1' }, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(mockCreatePromise).toHaveBeenCalledOnce();
      expect(mockUpdatePromise).not.toHaveBeenCalled();
    });

    it('never marks invoice as paid from payment claim', async () => {
      const paymentClaimAnalysis = {
        ...mockAnalysisResult,
        analysis: {
          ...mockAnalysisResult.analysis,
          primaryIntent: 'PAYMENT_COMPLETED',
          extractedPromises: [],
          extractedDisputes: [],
          summary: 'Customer claims they already paid',
        },
      };
      mockAnalyzeTranscript.mockResolvedValue(paymentClaimAnalysis);

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(result.analysis!.primaryIntent).toBe('PAYMENT_COMPLETED');
      expect(result.analysis!.promiseCount).toBe(0);
      expect(result.analysis!.disputeCount).toBe(0);
      // No invoice status update should have happened
      expect(mockSupabaseFrom).not.toHaveBeenCalledWith('invoices');
    });

    it('handles prompt injection in transcript', async () => {
      const injectionAnalysis = {
        ...mockAnalysisResult,
        analysis: {
          ...mockAnalysisResult.analysis,
          primaryIntent: 'OTHER',
          summary: '[Flagged] Ignore previous instructions',
          confidence: 0.1,
          extractedPromises: [],
          extractedDisputes: [],
          customerConcerns: [],
          warnings: ['Prompt injection detected'],
        },
        injectionDetected: true,
      };
      mockAnalyzeTranscript.mockResolvedValue(injectionAnalysis);

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(result.analysis!.injectionDetected).toBe(true);
      expect(result.analysis!.confidence).toBeLessThanOrEqual(0.3);
      expect(result.analysis!.summary).toContain('[Flagged]');
    });

    it('skips re-processing when call already has summary', async () => {
      const processedCall = { ...mockCallRow, summary: 'Already processed' };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: processedCall, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
      });

      expect(result.transcriptFound).toBe(true);
      expect(result.analysis).toBeNull();
      expect(mockAnalyzeTranscript).not.toHaveBeenCalled();
    });

    it('records communication even when no transcript', async () => {
      const callNoTranscript = { ...mockCallRow, transcript: null };

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: callNoTranscript, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
      });

      expect(result.transcriptFound).toBe(false);
      expect(result.communicationRecorded).toBe(true);
      expect(mockAnalyzeTranscript).not.toHaveBeenCalled();
    });

    it('handles AI analysis failure gracefully', async () => {
      mockAnalyzeTranscript.mockRejectedValue(new Error('AI provider unavailable'));

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(result.transcriptFound).toBe(true);
      expect(result.analysis).toBeNull();
      expect(result.communicationRecorded).toBe(true);
    });

    it('extracts multiple promises and disputes from single transcript', async () => {
      const multiIntentAnalysis = {
        ...mockAnalysisResult,
        analysis: {
          ...mockAnalysisResult.analysis,
          primaryIntent: 'PAYMENT_PROMISE',
          extractedPromises: [
            { promisedDate: '2026-08-22', promisedAmount: 15000, confidence: 0.9, quote: 'I will pay 15k by Friday' },
            { promisedDate: '2026-09-01', promisedAmount: 10000, confidence: 0.85, quote: 'Remaining 10k by next month' },
          ],
          extractedDisputes: [
            { category: 'tax_error', reason: 'Wrong GST rate applied', confidence: 0.88, quote: 'GST should be 18% not 24%' },
            { category: 'service_issue', reason: 'Late delivery penalty charged incorrectly', confidence: 0.82, quote: 'Delivery was on time' },
          ],
        },
      };
      mockAnalyzeTranscript.mockResolvedValue(multiIntentAnalysis);

      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        if (table === 'disputes') {
          return mockChain({ data: { id: 'dispute-' + Math.random() }, error: null });
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(result.analysis!.promiseCount).toBe(2);
      expect(result.analysis!.disputeCount).toBe(2);
      expect(mockCreatePromise).toHaveBeenCalledTimes(2);
    });

    it('creates a new dispute when no open dispute exists for the invoice', async () => {
      const disputeOnlyAnalysis = {
        ...mockAnalysisResult,
        analysis: {
          ...mockAnalysisResult.analysis,
          primaryIntent: 'DISPUTE',
          extractedPromises: [],
          extractedDisputes: [
            { category: 'tax_error', reason: 'Wrong GST rate applied', confidence: 0.88, quote: 'GST should be 18%' },
          ],
        },
      };
      mockAnalyzeTranscript.mockResolvedValue(disputeOnlyAnalysis);

      // First disputes query (find existing) returns null; insert returns new id
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        if (table === 'disputes') {
          const chain = mockChain({ data: null, error: null });
          chain.maybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
          chain.select = vi.fn(() => chain);
          chain.insert = vi.fn(() => {
            const insertChain = mockChain({ data: { id: 'new-dispute-1' }, error: null });
            return insertChain;
          });
          return chain;
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(result.analysis!.disputeCount).toBe(1);
      expect(result.analysis!.disputeIds).toEqual(['new-dispute-1']);
    });

    it('updates an existing open dispute instead of creating a duplicate', async () => {
      const disputeOnlyAnalysis = {
        ...mockAnalysisResult,
        analysis: {
          ...mockAnalysisResult.analysis,
          primaryIntent: 'DISPUTE',
          extractedPromises: [],
          extractedDisputes: [
            { category: 'tax_error', reason: 'Updated reason: GST now 24%', confidence: 0.9, quote: 'GST should be 18%' },
          ],
        },
      };
      mockAnalyzeTranscript.mockResolvedValue(disputeOnlyAnalysis);

      // First disputes query (find existing) returns an open dispute
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'calls') {
          return mockChain({ data: mockCallRow, error: null });
        }
        if (table === 'disputes') {
          const chain = mockChain({ data: null, error: null });
          // find-existing returns an open dispute row
          chain.maybeSingle = vi.fn()
            .mockResolvedValueOnce({ data: { id: 'existing-dispute-1', category: 'tax_error' }, error: null })
            .mockResolvedValueOnce({ data: { id: 'existing-dispute-1' }, error: null });
          chain.select = vi.fn(() => chain);
          chain.update = vi.fn(() => {
            const updateChain = mockChain({ data: { id: 'existing-dispute-1' }, error: null });
            return updateChain;
          });
          return chain;
        }
        return mockChain({ data: null, error: null });
      });

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: TEST_CALL_ID,
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
        invoiceId: TEST_INV,
      });

      expect(result.analysis!.disputeCount).toBe(1);
      expect(result.analysis!.disputeIds).toEqual(['existing-dispute-1']);
    });

    it('returns null result when call not found', async () => {
      mockSupabaseFrom.mockImplementation(() => mockChain({ data: null, error: null }));

      const { postCallProcessor } = await import('../../server/services/calls/postCallProcessor');
      const result = await postCallProcessor.processCompletedCall({
        callId: 'nonexistent',
        organizationId: TEST_ORG,
        customerId: TEST_CUST,
      });

      expect(result.transcriptFound).toBe(false);
      expect(result.communicationRecorded).toBe(false);
    });
  });
});
