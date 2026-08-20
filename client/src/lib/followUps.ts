import { apiRequest } from './apiClient';
import type { FollowUpRule, FollowUpTask } from '@shared/types';

export interface FollowUpTaskListItem extends FollowUpTask {
  invoiceNumber: string;
  customerName: string;
  ruleName?: string;
}

function assertSuccess<T>(response: { success: boolean; data?: T; error?: { message: string } }, fallback: string): T {
  if (!response.success || response.data === undefined) throw new Error(response.error?.message ?? fallback);
  return response.data;
}

export async function listFollowUpRules(orgId: string, token: string): Promise<FollowUpRule[]> {
  const response = await apiRequest<{ rules: FollowUpRule[] }>('/follow-up-rules', { orgId, token });
  return assertSuccess(response, 'Failed to load follow-up rules.').rules;
}

export async function listFollowUpTasks(orgId: string, token: string): Promise<FollowUpTaskListItem[]> {
  const response = await apiRequest<{ tasks: FollowUpTaskListItem[] }>('/follow-up-tasks', { orgId, token });
  return assertSuccess(response, 'Failed to load follow-up tasks.').tasks;
}
