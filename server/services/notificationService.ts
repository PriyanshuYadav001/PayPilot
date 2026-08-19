import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type {
  Notification,
} from '../../shared/types';

export interface NotificationSendInput {
  organizationId: string;
  customerId: string;
  invoiceId?: string;
  channel: 'email' | 'whatsapp';
  recipient: string;
  subject?: string;
  content: string;
  template?: string;
}

export interface NotificationResult {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceId?: string;
  channel: string;
  recipient: string;
  subject?: string;
  content: string;
  status: string;
  providerMessageId?: string;
  sentAt?: string;
}

export class NotificationService {
  constructor() {}

  async sendNotification(input: NotificationSendInput): Promise<NotificationResult> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        invoice_id: input.invoiceId,
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject,
        content: input.content,
        template: input.template,
        status: 'processing',
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }

    // TODO: Actually send via email/WhatsApp provider
    // For now, mark as sent after a short delay/simulation
    setTimeout(async () => {
      await supabase
        .from('notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', data.id);
    }, 1000);

    return {
      id: data.id,
      organizationId: data.organization_id,
      customerId: data.customer_id,
      invoiceId: data.invoice_id,
      channel: data.channel,
      recipient: data.recipient,
      subject: data.subject,
      content: data.content,
      status: data.status,
      providerMessageId: data.provider_message_id,
      sentAt: data.sent_at,
    } as NotificationResult;
  }

  async getNotifications(
    organizationId: string,
    channel?: string
  ): Promise<NotificationResult[]> {
    const {
      supabase,
    } = supabaseServer();

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', organizationId);

    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching notifications:', error);
      throw error;
    }

    return (data as any[]).map((notif) => ({
      id: notif.id,
      organizationId: notif.organization_id,
      customerId: notif.customer_id,
      invoiceId: notif.invoice_id,
      channel: notif.channel,
      recipient: notif.recipient,
      subject: notif.subject,
      content: notif.content,
      status: notif.status,
      providerMessageId: notif.provider_message_id,
      sentAt: notif.sent_at,
    }));
  }

  async getPendingNotifications(): Promise<NotificationResult[]> {
    const {
      supabase,
    } = supabaseServer();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('status', 'processing');

    if (error) {
      logger.error('Error fetching pending notifications:', error);
      throw error;
    }

    return (data as any[]).map((notif) => ({
      id: notif.id,
      organizationId: notif.organization_id,
      customerId: notif.customer_id,
      invoiceId: notif.invoice_id,
      channel: notif.channel,
      recipient: notif.recipient,
      subject: notif.subject,
      content: notif.content,
      status: notif.status,
      providerMessageId: notif.provider_message_id,
      sentAt: notif.sent_at,
    }));
  }
}