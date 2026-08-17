/**
 * Standard typed API Client with Tenant Header injection
 */

const BASE_URL = import.meta.env?.VITE_API_URL || '/api/v1';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown[];
  };
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit & { orgId?: string; token?: string } = {}
): Promise<ApiResponse<T>> {
  const { orgId, token, headers, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };

  // Let the browser set the multipart boundary for FormData bodies; otherwise
  // default to JSON.
  if (!(rest.body instanceof FormData) && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  if (orgId) {
    requestHeaders['X-Organization-Id'] = orgId;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: requestHeaders,
    ...rest,
  });

  return response.json();
}
