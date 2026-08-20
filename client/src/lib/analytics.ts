import { apiRequest } from './apiClient';

export interface AnalyticsOverview {
  totalOutstanding: number;
  overdueAmount: number;
  averageDsoDays: number;
  collectionEfficiencyRate: number;
}

export interface AgingBuckets {
  current: number;
  bucket1_30: number;
  bucket31_60: number;
  bucket90Plus: number;
}

function assertSuccess<T>(response: { success: boolean; data?: T; error?: { message: string } }, fallback: string): T {
  if (!response.success || response.data === undefined) throw new Error(response.error?.message ?? fallback);
  return response.data;
}

export async function getAnalyticsOverview(orgId: string, token: string): Promise<AnalyticsOverview> {
  return assertSuccess(await apiRequest<AnalyticsOverview>('/analytics/overview', { orgId, token }), 'Failed to load analytics.');
}

export async function getAgingBuckets(orgId: string, token: string): Promise<AgingBuckets> {
  return assertSuccess(await apiRequest<AgingBuckets>('/analytics/aging-buckets', { orgId, token }), 'Failed to load aging buckets.');
}
