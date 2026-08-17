import { z } from 'zod';

export const paymentPromiseCreateSchema = z.object({
  invoiceId: z.string().uuid(),
  customerId: z.string().uuid(),
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  promisedAmount: z.number().positive().optional(),
  source: z.enum(['manual', 'ai_extracted', 'customer_portal', 'webhook']).default('manual'),
  notes: z.string().max(5000).optional(),
  communicationId: z.string().uuid().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  aiExtractedQuote: z.string().max(5000).optional(),
});

export const paymentPromiseUpdateSchema = z
  .object({
    status: z.enum(['pending', 'fulfilled', 'missed', 'cancelled']).optional(),
    promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
    promisedAmount: z.number().positive().optional(),
    notes: z.string().max(5000).optional(),
    resolvedAt: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided for update.',
    path: ['_'],
  });

export const paymentPromiseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'fulfilled', 'missed', 'cancelled']).optional(),
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  sortBy: z.enum(['promised_date', 'created_at', 'status']).default('promised_date'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const paymentPromiseIdParamSchema = z.object({
  id: z.string().uuid(),
});
