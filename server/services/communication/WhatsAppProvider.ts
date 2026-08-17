export interface WhatsAppTemplatePayload {
  to: string; // E.164 format (+919876543210)
  templateName: string;
  languageCode: string;
  parameters: Array<{
    type: 'text' | 'currency' | 'date_time' | 'document';
    value: string;
  }>;
  mediaUrl?: string;
  paymentLinkUrl?: string;
}

export interface WhatsAppDirectMessagePayload {
  to: string;
  body: string;
}

export interface WhatsAppDeliveryResult {
  providerMessageId: string;
  status: 'accepted' | 'sent' | 'delivered' | 'failed';
  timestamp: Date;
}

export interface IWhatsAppProvider {
  sendTemplateMessage(payload: WhatsAppTemplatePayload): Promise<WhatsAppDeliveryResult>;
  sendTextMessage(payload: WhatsAppDirectMessagePayload): Promise<WhatsAppDeliveryResult>;
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean;
}
