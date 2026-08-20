import { z } from 'zod';

export const followUpTaskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled', 'skipped']).optional(),
  invoiceId: z.string().uuid().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
