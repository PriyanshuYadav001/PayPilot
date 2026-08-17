import type { IEmailProvider, EmailPayload, EmailDeliveryResult } from '../communication/EmailProvider';
import { logger } from '../../utils/logger';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ResendEmailProvider implements IEmailProvider {
  private apiKey: string;
  private fromAddress: string;
  private fromName: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY ?? '';
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS ?? 'billing@paypilot.io';
    this.fromName = process.env.EMAIL_FROM_NAME ?? 'PayPilot Collections';
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async sendEmail(payload: EmailPayload): Promise<EmailDeliveryResult> {
    if (!this.isConfigured) {
      throw new Error('RESEND_API_KEY is not configured.');
    }

    const from = payload.from ?? `${this.fromName} <${this.fromAddress}>`;
    const body = {
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: payload.replyTo,
    };

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => 'unknown');
          throw new Error(`Resend API error ${response.status}: ${errBody}`);
        }

        const result = (await response.json()) as { id: string };
        logger.info('Resend email sent', { messageId: result.id, to: payload.to });

        return {
          messageId: result.id,
          status: 'sent',
          timestamp: new Date(),
        };
      } catch (err) {
        lastError = err;
        logger.warn(`Resend email attempt ${attempt}/${MAX_RETRIES} failed`, {
          to: payload.to,
          error: err instanceof Error ? err.message : String(err),
        });

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
        }
      }
    }

    logger.error('Resend email failed after all retries', { to: payload.to });
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
