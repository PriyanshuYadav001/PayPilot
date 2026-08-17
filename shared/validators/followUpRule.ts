import { z } from 'zod';

export const followUpRuleCreateSchema = z.object({
  name: z.string().min(2).max(100),
  daysRelativeToDue: z.number().int(),
  channel: z.enum(['email', 'whatsapp', 'call']),
  templateSubject: z.string().max(200).optional(),
  templateBody: z.string().min(5).max(5000),
  templateIdExternal: z.string().max(200).optional(),
  escalationPriority: z.number().int().min(1).default(1),
  includePaymentLink: z.boolean().default(true),
  includeQrCode: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const followUpRuleUpdateSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    daysRelativeToDue: z.number().int().optional(),
    channel: z.enum(['email', 'whatsapp', 'call']).optional(),
    templateSubject: z.string().max(200).optional(),
    templateBody: z.string().min(5).max(5000).optional(),
    templateIdExternal: z.string().max(200).optional(),
    escalationPriority: z.number().int().min(1).optional(),
    includePaymentLink: z.boolean().optional(),
    includeQrCode: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided for update.',
    path: ['_'],
  });

export const followUpRuleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z.enum(['true', 'false']).optional(),
  channel: z.enum(['email', 'whatsapp', 'call']).optional(),
  sortBy: z.enum(['name', 'days_relative_to_due', 'escalation_priority', 'created_at']).default('escalation_priority'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const followUpRuleIdParamSchema = z.object({
  id: z.string().uuid(),
});
