import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiRequest } from '../../client/src/lib/apiClient';

describe('Client API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('injects X-Organization-Id and Authorization headers when provided', async () => {
    const mockResponse = {
      success: true,
      data: { message: 'ok' },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockResponse),
    });

    global.fetch = fetchMock;

    const result = await apiRequest('/test', {
      token: 'test-jwt-token',
      orgId: 'org-uuid-123',
    });

    expect(fetchMock).toHaveBeenCalled();
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer test-jwt-token');
    expect(headers['X-Organization-Id']).toBe('org-uuid-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(result).toEqual(mockResponse);
  });
});
