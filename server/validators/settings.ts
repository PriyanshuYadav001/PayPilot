import { z } from 'zod';

export const organizationUpdateSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().optional(),
  billingAddress: z
    .record(z.string(), z.union([z.number(), z.string()]).optional())
    .optional(),
});

export const invoiceDefaultsSchema = z.object({
  defaultTerms: z.string().optional(),
  defaultCurrency: z.string().length(3).optional(),
  defaultPaymentTerms: z.number().int().min(1).optional(),
});

export const paymentSettingsSchema = z.object({
  autoRecordPayments: z.boolean().default(true),
  paymentReminderDays: z.number().int().min(0).optional(),
  supportedPaymentMethods: z
    .enum(['credit_card', 'debit_card', 'bank_transfer', 'upi', 'wallet'])
    .array()
    .optional(),
});

export const followUpDefaultsSchema = z.object({
  defaultFollowUpRule: z.string().optional(),
  defaultReminderInterval: z.number().int().min(1).optional(),
  defaultReminderChannels: z
    .enum(['email', 'whatsapp', 'sms'])
    .array()
    .optional(),
});

export const settingsUpdateSchema = z.object({
  organization: organizationUpdateSchema,
  invoiceDefaults: invoiceDefaultsSchema.optional(),
  paymentSettings: paymentSettingsSchema.optional(),
  followUpDefaults: followUpDefaultsSchema.optional(),
});

export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type InvoiceDefaultsInput = z.infer<typeof invoiceDefaultsSchema>;
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;
export type FollowUpDefaultsInput = z.infer<typeof followUpDefaultsSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
