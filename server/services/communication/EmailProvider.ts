export interface EmailPayload {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType: string;
  }>;
  trackingId?: string;
}

export interface EmailDeliveryResult {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  timestamp: Date;
}

export interface IEmailProvider {
  sendEmail(payload: EmailPayload): Promise<EmailDeliveryResult>;
}
