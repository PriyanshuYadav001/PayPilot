import { z } from 'zod';

export const communicationChannelSchema = z.enum(['email', 'whatsapp', 'call']);
export const communicationDirectionSchema = z.enum(['outbound', 'inbound']);

export const communicationSendSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  channel: communicationChannelSchema,
  message: z.string().trim().min(1).max(5000),
  subject: z.string().trim().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const communicationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  channel: communicationChannelSchema.optional(),
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  direction: communicationDirectionSchema.optional(),
});
