import { ResendEmailProvider } from './ResendEmailProvider';
import { registerCommunicationProvider } from '../communication';
import { logger } from '../../utils/logger';

let initialized = false;

/**
 * Initialize the email provider from environment variables.
 * Safe to call multiple times — only registers once.
 */
export function initializeEmailProvider(): void {
  if (initialized) return;

  const provider = new ResendEmailProvider();
  if (provider.isConfigured) {
    registerCommunicationProvider('email', () => provider);
    logger.info('Email provider initialized (Resend)', {
      from: process.env.EMAIL_FROM_ADDRESS,
    });
  } else {
    logger.warn('Email provider not configured — RESEND_API_KEY is missing');
  }

  initialized = true;
}

export { ResendEmailProvider } from './ResendEmailProvider';
export { emailService } from './emailService';
export {
  buildInvoiceReminderEmail,
  buildOverdueReminderEmail,
  buildPaymentLinkEmail,
  buildPaymentConfirmationEmail,
  buildPaymentPromiseReminderEmail,
} from './emailTemplates';
