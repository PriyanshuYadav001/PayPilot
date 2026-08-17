import { z } from 'zod';

export const customerCreateSchema = z.object({
  companyName: z.string().min(2).max(150),
  contactName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  gstin: z.string().optional(),
  billingAddress: z.record(z.string(), z.unknown()).default({}),
  creditPeriodDays: z.number().int().min(0).default(30),
  isDnd: z.boolean().default(false),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const customerUpdateSchema = z
  .object({
    companyName: z.string().min(2).max(150).optional(),
    contactName: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    whatsappNumber: z.string().optional(),
    gstin: z.string().optional(),
    billingAddress: z.record(z.string(), z.unknown()).optional(),
    creditPeriodDays: z.number().int().min(0).optional(),
    isDnd: z.boolean().optional(),
    notes: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided for update.',
    path: ['_'],
  });

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isDnd: z.enum(['true', 'false']).optional(),
  sortBy: z
    .enum(['company_name', 'contact_name', 'email', 'phone', 'created_at', 'updated_at'])
    .default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const customerIdParamSchema = z.object({
  id: z.string().uuid(),
});
