import { describe, it, expect } from 'vitest';
import {
  organizationCreateSchema,
  customerCreateSchema,
  invoiceCreateSchema,
  followUpRuleSchema,
  recordManualPaymentSchema,
  logPaymentPromiseSchema,
  raiseDisputeSchema,
  aiAnalyzeReplySchema,
  paymentLinkCreateSchema,
  paymentCreateSchema,
} from '../../shared/validators';

describe('Shared Zod Validators', () => {
  describe('organizationCreateSchema', () => {
    it('validates correct organization payload', () => {
      const payload = {
        name: 'Acme Corp',
        slug: 'acme-corp',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
      };
      const result = organizationCreateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects invalid slugs with uppercase or special characters', () => {
      const payload = {
        name: 'Acme Corp',
        slug: 'Acme_Corp!',
      };
      const result = organizationCreateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('customerCreateSchema', () => {
    it('validates a valid customer payload', () => {
      const payload = {
        companyName: 'Globex Ltd',
        contactName: 'Jane Doe',
        email: 'jane@globex.com',
        creditPeriodDays: 45,
      };
      const result = customerCreateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects customer with invalid email', () => {
      const payload = {
        companyName: 'Globex Ltd',
        contactName: 'Jane Doe',
        email: 'not-an-email',
      };
      const result = customerCreateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('invoiceCreateSchema', () => {
    it('validates a valid invoice structure with items', () => {
      const payload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        invoiceNumber: 'INV-2026-001',
        issueDate: '2026-08-16',
        dueDate: '2026-09-15',
        currency: 'INR',
        items: [
          {
            description: 'Cloud Consulting Services',
            quantity: 10,
            unitPrice: 1500,
            taxRate: 18,
          },
        ],
      };
      const result = invoiceCreateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('fails when items list is empty', () => {
      const payload = {
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        invoiceNumber: 'INV-2026-001',
        issueDate: '2026-08-16',
        dueDate: '2026-09-15',
        items: [],
      };
      const result = invoiceCreateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('followUpRuleSchema', () => {
    it('validates relative offset cadence rules', () => {
      const rule = {
        name: 'Urgent WhatsApp Escalation',
        daysRelativeToDue: 7,
        channel: 'whatsapp',
        templateBody: 'Please clear your overdue invoice {{invoice_number}} immediately.',
      };
      const result = followUpRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });
  });

  describe('recordManualPaymentSchema', () => {
    it('validates payment recording payload', () => {
      const payment = {
        amount: 25000,
        method: 'upi',
        referenceNumber: 'UPI/123456789/TXN',
      };
      const result = recordManualPaymentSchema.safeParse(payment);
      expect(result.success).toBe(true);
    });
  });

  describe('logPaymentPromiseSchema & raiseDisputeSchema', () => {
    it('validates promise to pay structure', () => {
      const promise = {
        invoiceId: '123e4567-e89b-12d3-a456-426614174000',
        promisedDate: '2026-08-25',
        promisedAmount: 10000,
      };
      const result = logPaymentPromiseSchema.safeParse(promise);
      expect(result.success).toBe(true);
    });

    it('validates dispute creation structure', () => {
      const dispute = {
        invoiceId: '123e4567-e89b-12d3-a456-426614174000',
        category: 'wrong_amount',
        reason: 'Service hours billed exceed actual delivery.',
      };
      const result = raiseDisputeSchema.safeParse(dispute);
      expect(result.success).toBe(true);
    });
  });

  describe('aiAnalyzeReplySchema', () => {
    it('validates inbound message payload for AI analysis', () => {
      const aiInput = {
        rawText: 'We will process the payment by next Monday.',
        channel: 'email',
      };
      const result = aiAnalyzeReplySchema.safeParse(aiInput);
      expect(result.success).toBe(true);
    });
  });

  describe('paymentLinkCreateSchema & paymentCreateSchema', () => {
    it('validates a payment link create payload with a partial amount', () => {
      const payload = {
        invoiceId: '123e4567-e89b-42d3-a456-426614174000',
        amount: 5000,
        expiresInDays: 3,
      };
      const result = paymentLinkCreateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects payment link creation with a zero amount', () => {
      const payload = {
        invoiceId: '123e4567-e89b-42d3-a456-426614174000',
        amount: 0,
      };
      const result = paymentLinkCreateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('validates payment creation with an idempotency key', () => {
      const payload = {
        invoiceId: '123e4567-e89b-42d3-a456-426614174000',
        idempotencyKey: '123e4567-e89b-42d3-a456-426614174001',
      };
      const result = paymentCreateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects payment creation with a malformed idempotency key', () => {
      const payload = {
        invoiceId: '123e4567-e89b-42d3-a456-426614174000',
        idempotencyKey: 'not-a-uuid',
      };
      const result = paymentCreateSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
