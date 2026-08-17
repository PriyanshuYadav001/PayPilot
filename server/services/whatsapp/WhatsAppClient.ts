/**
 * Concrete WhatsApp Business API provider (Meta Cloud API).
 *
 * Implements the IWhatsAppProvider interface from the unified communication
 * architecture. Handles template messages, free-form text messages, and
 * webhook signature verification using HMAC-SHA256.
 *
 * Environment variables required:
 *   WHATSAPP_PHONE_NUMBER_ID  — Meta phone number ID
 *   WHATSAPP_ACCESS_TOKEN     — Meta API access token (temporary or permanent)
 *   WHATSAPP_APP_SECRET       — Meta app secret for webhook verification
 *   WHATSAPP_BUSINESS_ACCOUNT_ID — Meta WhatsApp Business Account ID
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger';
import type {
  IWhatsAppProvider,
  WhatsAppTemplatePayload,
  WhatsAppDirectMessagePayload,
  WhatsAppDeliveryResult,
} from '../communication/WhatsAppProvider';

const META_CLOUD_API_VERSION = 'v21.0';
const META_API_BASE = 'https://graph.facebook.com';

interface MetaAPIResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

interface MetaAPIError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class WhatsAppClient implements IWhatsAppProvider {
  private phoneNumberId: string;
  private accessToken: string;
  private appSecret: string;

  constructor(config?: {
    phoneNumberId?: string;
    accessToken?: string;
    appSecret?: string;
  }) {
    this.phoneNumberId = config?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
    this.accessToken = config?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? '';
    this.appSecret = config?.appSecret ?? process.env.WHATSAPP_APP_SECRET ?? '';
  }

  private get apiBase(): string {
    return `${META_API_BASE}/${META_CLOUD_API_VERSION}`;
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.apiBase}/${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      const apiError = data as MetaAPIError;
      logger.error('WhatsApp API error', {
        endpoint,
        status: response.status,
        errorMessage: apiError.error?.message,
        errorCode: apiError.error?.code,
        fbtraceId: apiError.error?.fbtrace_id,
      });
      throw new Error(`WhatsApp API error: ${apiError.error?.message ?? 'Unknown error'}`);
    }

    return data as T;
  }

  async sendTemplateMessage(payload: WhatsAppTemplatePayload): Promise<WhatsAppDeliveryResult> {
    const templateBody = {
      messaging_product: 'whatsapp',
      to: payload.to,
      type: 'template',
      template: {
        name: payload.templateName,
        language: { code: payload.languageCode },
        components: payload.parameters.length > 0
          ? [
              {
                type: 'body',
                parameters: payload.parameters.map((param) => ({
                  type: param.type,
                  [param.type === 'text' ? 'text' : param.type === 'currency' ? 'currency' : 'date_time']: param.type === 'currency'
                    ? { fallback_value: param.value }
                    : param.type === 'date_time'
                    ? { fallback_value: param.value }
                    : { fallback_value: param.value },
                })),
              },
            ]
          : [],
      },
    };

    const result = await this.post<MetaAPIResponse>(
      `${this.phoneNumberId}/messages`,
      templateBody,
    );

    const messageId = result.messages?.[0]?.id ?? '';

    return {
      providerMessageId: messageId,
      status: 'accepted',
      timestamp: new Date(),
    };
  }

  async sendTextMessage(payload: WhatsAppDirectMessagePayload): Promise<WhatsAppDeliveryResult> {
    const textBody = {
      messaging_product: 'whatsapp',
      to: payload.to,
      type: 'text',
      text: { body: payload.body },
    };

    const result = await this.post<MetaAPIResponse>(
      `${this.phoneNumberId}/messages`,
      textBody,
    );

    const messageId = result.messages?.[0]?.id ?? '';

    return {
      providerMessageId: messageId,
      status: 'accepted',
      timestamp: new Date(),
    };
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!this.appSecret) {
      logger.warn('WHATSAPP_APP_SECRET not configured — skipping webhook verification');
      return false;
    }

    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    const expectedSignature = crypto
      .createHmac('sha256', this.appSecret)
      .update(bodyStr)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );
  }
}
