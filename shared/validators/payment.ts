import { z } from 'zod';

export const paymentLinkCreateSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive().max(1000000000).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const paymentLinkIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const paymentCreateSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive().max(1000000000).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export const paymentProviderParamSchema = z.object({
  provider: z.enum(['razorpay']),
});

export const publicPaymentTokenParamSchema = z.object({
  token: z.string().uuid(),
});
