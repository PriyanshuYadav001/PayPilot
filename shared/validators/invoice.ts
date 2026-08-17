import { z } from 'zod';

export const invoiceStatusValues = [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
] as const;

export const invoiceStatusSchema = z.enum(invoiceStatusValues);

export const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).max(100).default(0),
});

export const invoiceCreateSchema = z.object({
  customerId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(50),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  currency: z.string().length(3).default('INR'),
  discount: z.number().min(0).default(0),
  items: z.array(invoiceItemSchema).min(1),
  status: z.enum(['draft', 'sent']).default('draft'),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
});

export const invoiceUpdateSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    invoiceNumber: z.string().min(1).max(50).optional(),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
    currency: z.string().length(3).optional(),
    discount: z.number().min(0).optional(),
    items: z.array(invoiceItemSchema).min(1).optional(),
    status: invoiceStatusSchema.optional(),
    amountPaid: z.number().min(0).optional(),
    notes: z.string().optional(),
    termsAndConditions: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided for update.',
    path: ['_'],
  });

export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: invoiceStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
  sortBy: z
    .enum(['invoice_number', 'issue_date', 'due_date', 'status', 'total_amount', 'created_at', 'updated_at'])
    .default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const invoiceIdParamSchema = z.object({
  id: z.string().uuid(),
});
