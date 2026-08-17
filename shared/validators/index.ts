import { z } from 'zod';

export * from './customer';
export * from './invoice';
export * from './payment';

export const organizationCreateSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and hyphens'),
  currency: z.string().length(3).default('INR'),
  timezone: z.string().default('Asia/Kolkata'),
  taxId: z.string().optional(),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().optional(),
  billingAddress: z.record(z.string(), z.unknown()).default({}),
});

export const recordManualPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['upi', 'card', 'netbanking', 'wallet', 'bank_transfer', 'cheque', 'cash', 'other']),
  referenceNumber: z.string().optional(),
  paidAt: z.string().optional(),
  notes: z.string().optional(),
});

export const followUpRuleSchema = z.object({
  name: z.string().min(2).max(100),
  daysRelativeToDue: z.number().int(),
  channel: z.enum(['email', 'whatsapp', 'call', 'sms']),
  templateSubject: z.string().optional(),
  templateBody: z.string().min(5),
  templateIdExternal: z.string().optional(),
  escalationPriority: z.number().int().min(1).default(1),
  includePaymentLink: z.boolean().default(true),
  includeQrCode: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const logPaymentPromiseSchema = z.object({
  invoiceId: z.string().uuid(),
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  promisedAmount: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const raiseDisputeSchema = z.object({
  invoiceId: z.string().uuid(),
  category: z.enum(['wrong_amount', 'service_issue', 'tax_error', 'unauthorized', 'other']),
  reason: z.string().min(5),
});

export const aiAnalyzeReplySchema = z.object({
  rawText: z.string().min(1),
  channel: z.enum(['email', 'whatsapp', 'call_transcript']),
  invoiceId: z.string().uuid().optional(),
});

// ============================================================================
// Authentication Validators
// ============================================================================

export const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});
