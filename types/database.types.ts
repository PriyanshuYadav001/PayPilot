// ============================================================
// ENUMS
// ============================================================

export type invoice_status =
  | 'draft'
  | 'issued'
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'disputed'
  | 'voided'
  | 'written_off'
  | 'sent'
  | 'cancelled';

export type payment_status =
  | 'captured'
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type payment_method =
  | 'upi'
  | 'card'
  | 'netbanking'
  | 'wallet'
  | 'bank_transfer'
  | 'cheque'
  | 'cash'
  | 'other';

export type communication_channel = 'email' | 'whatsapp' | 'call' | 'sms';

export type message_direction = 'outbound' | 'inbound';

export type delivery_status =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'replied'
  | 'failed'
  | 'bounced';

export type task_status =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type promise_status = 'pending' | 'fulfilled' | 'missed' | 'cancelled';

export type plan_tier =
  | 'free_trial'
  | 'starter'
  | 'growth'
  | 'scale'
  | 'enterprise';

export type subscription_status =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

export type member_role = 'owner' | 'admin' | 'member' | 'viewer';

export type communication_status = 'queued' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'bounced';

export type payment_link_status = 'active' | 'paid' | 'expired' | 'cancelled';
export type dispute_status = 'open' | 'under_review' | 'resolved_rejected' | 'resolved_credited' | 'resolved_paid';
export type call_status = 'queued' | 'ringing' | 'in_progress' | 'completed' | 'busy' | 'no_answer' | 'failed';
export type usage_metric = 'invoices_created' | 'whatsapp_sent' | 'emails_sent' | 'calls_made' | 'ai_analyses';
export type promise_source = 'manual' | 'ai_extracted' | 'customer_portal' | 'webhook';
export type dispute_source = 'manual' | 'ai_extracted' | 'ai_transcript' | 'customer_portal';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type RequiredInsert<Row, Keys extends keyof Row> = Partial<Omit<Row, Keys>> & Pick<Row, Keys>;

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};
type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  currency: string;
  timezone: string;
  billing_address: Json;
  tax_id: string | null;
  support_email: string | null;
  support_phone: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: member_role;
  invited_email: string | null;
  status: 'active' | 'invited' | 'suspended';
  created_at: string;
  updated_at: string;
};
type CustomerRow = {
  id: string;
  organization_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  whatsapp_number: string | null;
  gstin: string | null;
  billing_address: Json;
  credit_period_days: number;
  is_dnd: boolean;
  notes: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};
type InvoiceRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax_total: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: invoice_status;
  pdf_url: string | null;
  notes: string | null;
  terms_and_conditions: string | null;
  is_follow_up_active: boolean;
  follow_up_paused_until: string | null;
  last_follow_up_at: string | null;
  next_follow_up_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  created_at: string;
};
type PaymentRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  payment_link_id: string | null;
  amount: number;
  currency: string;
  method: payment_method;
  status: payment_status;
  provider: string;
  provider_payment_id: string | null;
  provider_order_id: string | null;
  reference_number: string | null;
  paid_at: string;
  notes: string | null;
  raw_payload: Json;
  created_at: string;
  idempotency_key: string | null;
};
type PaymentLinkRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  provider: string;
  provider_link_id: string;
  short_url: string;
  qr_code_url: string | null;
  amount: number;
  currency: string;
  status: payment_link_status;
  expires_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  public_token: string;
};
type CommunicationRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_id: string | null;
  follow_up_task_id: string | null;
  channel: communication_channel;
  direction: message_direction;
  sender_identifier: string | null;
  recipient_identifier: string;
  subject: string | null;
  message: string;
  status: communication_status;
  provider_message_id: string | null;
  sent_at: string;
  ai_analyzed: boolean;
  ai_intent: string | null;
  ai_sentiment: string | null;
  metadata: Json;
  created_at: string;
};
type FollowUpRuleRow = {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  days_relative_to_due: number;
  channel: communication_channel;
  template_subject: string | null;
  template_body: string;
  template_id_external: string | null;
  escalation_priority: number;
  include_payment_link: boolean;
  include_qr_code: boolean;
  created_at: string;
  updated_at: string;
};
type FollowUpTaskRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  rule_id: string | null;
  channel: communication_channel;
  scheduled_for: string;
  executed_at: string | null;
  status: task_status;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};
type PaymentPromiseRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  customer_id: string;
  communication_id: string | null;
  promised_date: string;
  promised_amount: number | null;
  confidence_score: number | null;
  status: promise_status;
  source: promise_source;
  ai_extracted_quote: string | null;
  notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};
type DisputeRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  customer_id: string;
  communication_id: string | null;
  category: string;
  reason: string;
  status: dispute_status;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  source: dispute_source;
  metadata: Json;
};
type CallRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_id: string | null;
  follow_up_task_id: string | null;
  provider: string;
  provider_call_id: string | null;
  from_number: string;
  to_number: string;
  status: call_status;
  duration_seconds: number;
  recording_url: string | null;
  transcript: string | null;
  summary: string | null;
  started_at: string | null;
  ended_at: string | null;
  metadata: Json;
  created_at: string;
};
type WebhookEventRow = {
  id: string;
  organization_id: string | null;
  provider: string;
  event_type: string;
  provider_event_id: string;
  payload: Json;
  is_processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
};
type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_tier: plan_tier;
  status: subscription_status;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  provider: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  created_at: string;
  updated_at: string;
};
type UsageRecordRow = {
  id: string;
  organization_id: string;
  metric: usage_metric;
  period_start: string;
  period_end: string;
  count: number;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<ProfileRow, RequiredInsert<ProfileRow, 'id' | 'email' | 'full_name'>>;
      organizations: TableDefinition<OrganizationRow, RequiredInsert<OrganizationRow, 'name' | 'slug'>>;
      organization_members: TableDefinition<OrganizationMemberRow, RequiredInsert<OrganizationMemberRow, 'organization_id' | 'user_id'>>;
      customers: TableDefinition<CustomerRow, RequiredInsert<CustomerRow, 'organization_id' | 'company_name' | 'contact_name' | 'email'>>;
      invoices: TableDefinition<InvoiceRow, RequiredInsert<InvoiceRow, 'organization_id' | 'customer_id' | 'invoice_number' | 'issue_date' | 'due_date' | 'subtotal' | 'amount_due'>>;
      invoice_items: TableDefinition<InvoiceItemRow, RequiredInsert<InvoiceItemRow, 'invoice_id' | 'description' | 'unit_price' | 'total'>>;
      payments: TableDefinition<PaymentRow, RequiredInsert<PaymentRow, 'organization_id' | 'invoice_id' | 'amount'>>;
      payment_links: TableDefinition<PaymentLinkRow, RequiredInsert<PaymentLinkRow, 'organization_id' | 'invoice_id' | 'provider_link_id' | 'short_url' | 'amount'>>;
      communications: TableDefinition<CommunicationRow, RequiredInsert<CommunicationRow, 'organization_id' | 'customer_id' | 'recipient_identifier' | 'message'>>;
      follow_up_rules: TableDefinition<FollowUpRuleRow, RequiredInsert<FollowUpRuleRow, 'organization_id' | 'name' | 'days_relative_to_due' | 'channel' | 'template_body'>>;
      follow_up_tasks: TableDefinition<FollowUpTaskRow, RequiredInsert<FollowUpTaskRow, 'organization_id' | 'invoice_id' | 'channel' | 'scheduled_for'>>;
      payment_promises: TableDefinition<PaymentPromiseRow, RequiredInsert<PaymentPromiseRow, 'organization_id' | 'invoice_id' | 'customer_id' | 'promised_date'>>;
      disputes: TableDefinition<DisputeRow, RequiredInsert<DisputeRow, 'organization_id' | 'invoice_id' | 'customer_id' | 'category' | 'reason'>>;
      calls: TableDefinition<CallRow, RequiredInsert<CallRow, 'organization_id' | 'customer_id' | 'from_number' | 'to_number'>>;
      webhook_events: TableDefinition<WebhookEventRow, RequiredInsert<WebhookEventRow, 'provider' | 'event_type' | 'provider_event_id' | 'payload'>>;
      subscriptions: TableDefinition<SubscriptionRow, RequiredInsert<SubscriptionRow, 'organization_id' | 'current_period_end'>>;
      usage_records: TableDefinition<UsageRecordRow, RequiredInsert<UsageRecordRow, 'organization_id' | 'metric' | 'period_start' | 'period_end'>>;
    };
    Views: Record<string, never>;
    Functions: {
      [functionName: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      invoice_status: invoice_status;
      payment_status: payment_status;
      payment_method: payment_method;
      communication_channel: communication_channel;
      message_direction: message_direction;
      communication_status: communication_status;
      task_status: task_status;
      promise_status: promise_status;
      plan_tier: plan_tier;
      subscription_status: subscription_status;
      member_role: member_role;
      payment_link_status: payment_link_status;
      dispute_status: dispute_status;
      call_status: call_status;
      usage_metric: usage_metric;
    };
    CompositeTypes: Record<string, never>;
  };
};

// ============================================================
// PROFILES
// ============================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// ORGANIZATIONS
// ============================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  currency: string;
  timezone: string;
  billing_address: {
    [key: string]: unknown;
  };
  tax_id?: string;
  support_email?: string;
  support_phone?: string;
  owner_id?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// ORGANIZATION MEMBERS
// ============================================================

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: member_role;
  invited_email?: string;
  status: 'active' | 'invited' | 'suspended';
  created_at: string;
  updated_at: string;
}

// ============================================================
// CUSTOMERS
// ============================================================

export interface Customer {
  id: string;
  organization_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  whatsapp_number?: string;
  gstin?: string;
  billing_address: {
    [key: string]: unknown;
  };
  credit_period_days: number;
  is_dnd: boolean;
  notes?: string;
  metadata: {
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

// ============================================================
// INVOICES
// ============================================================

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax_total: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: invoice_status;
  pdf_url?: string;
  notes?: string;
  terms_and_conditions?: string;
  is_follow_up_active: boolean;
  follow_up_paused_until?: string;
  last_follow_up_at?: string;
  next_follow_up_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
}

// ============================================================
// PAYMENTS
// ============================================================

export interface Payment {
  id: string;
  organization_id: string;
  invoice_id: string;
  payment_link_id?: string;
  amount: number;
  currency: string;
  method: payment_method;
  status: payment_status;
  provider: string;
  provider_payment_id?: string;
  provider_order_id?: string;
  reference_number?: string;
  paid_at?: string;
  notes?: string;
  raw_payload: {
    [key: string]: unknown;
  };
  created_at: string;
}

// ============================================================
// PAYMENT LINKS
// ============================================================

export interface PaymentLink {
  id: string;
  organization_id: string;
  invoice_id: string;
  provider: string;
  provider_link_id: string;
  short_url: string;
  qr_code_url?: string;
  amount: number;
  currency: string;
  status: 'active' | 'paid' | 'expired' | 'cancelled';
  expires_at?: string;
  metadata: {
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
  public_token?: string;
}

// ============================================================
// FOLLOW UP RULES
// ============================================================

export interface FollowUpRule {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  days_relative_to_due: number;
  channel: communication_channel;
  template_subject?: string;
  template_body: string;
  template_id_external?: string;
  escalation_priority: number;
  include_payment_link: boolean;
  include_qr_code: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// FOLLOW UP TASKS
// ============================================================

export interface FollowUpTask {
  id: string;
  organization_id: string;
  invoice_id: string;
  rule_id?: string;
  channel: communication_channel;
  scheduled_for: string;
  executed_at?: string;
  status: task_status;
  retry_count: number;
  max_retries: number;
  error_message?: string;
  metadata: {
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

// ============================================================
// COMMUNICATIONS
// ============================================================

export interface Communication {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_id?: string;
  follow_up_task_id?: string;
  channel: communication_channel;
  direction: message_direction;
  sender_identifier?: string;
  recipient_identifier: string;
  subject?: string;
  message: string;
  status: delivery_status;
  provider_message_id?: string;
  sent_at?: string;
  ai_analyzed: boolean;
  ai_intent?: string;
  ai_sentiment?: string;
  metadata: {
    [key: string]: unknown;
  };
  created_at: string;
}

// ============================================================
// PAYMENT PROMISES
// ============================================================

export interface PromisedPayment {
  id: string;
  organization_id: string;
  invoice_id: string;
  customer_id: string;
  communication_id?: string;
  promised_date: string;
  promised_amount: number;
  confidence_score: number;
  status: promise_status;
  source: 'manual' | 'ai_extracted' | 'customer_portal' | 'webhook';
  ai_extracted_quote?: string;
  notes?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// DISPUTES
// ============================================================

export interface Dispute {
  id: string;
  organization_id: string;
  invoice_id: string;
  customer_id: string;
  communication_id?: string;
  category: 'wrong_amount' | 'service_issue' | 'tax_error' | 'unauthorized' | 'other';
  reason: string;
  status: 'open' | 'under_review' | 'resolved_rejected' | 'resolved_credited' | 'resolved_paid';
  resolution_notes?: string;
  resolved_by?: string;
  resolved_at?: string;
  source: 'manual' | 'ai_extracted' | 'ai_transcript' | 'customer_portal';
  metadata: {
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

// ============================================================
// CALLS
// ============================================================

export interface Call {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_id?: string;
  follow_up_task_id?: string;
  provider: string;
  provider_call_id?: string;
  from_number: string;
  to_number: string;
  status: 'queued' | 'ringing' | 'in_progress' | 'completed' | 'busy' | 'no_answer' | 'failed';
  duration_seconds: number;
  recording_url?: string;
  transcript?: string;
  summary?: string;
  started_at?: string;
  ended_at?: string;
  metadata: {
    [key: string]: unknown;
  };
  created_at: string;
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================

export interface Subscription {
  id: string;
  organization_id: string;
  plan_tier: plan_tier;
  status: subscription_status;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  provider: string;
  provider_subscription_id?: string;
  provider_customer_id?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// USAGE RECORDS
// ============================================================

export interface UsageRecord {
  id: string;
  organization_id: string;
  metric: 'invoices_created' | 'whatsapp_sent' | 'emails_sent' | 'calls_made' | 'ai_analyses';
  period_start: string;
  period_end: string;
  count: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// WEBHOOK EVENTS
// ============================================================

export interface WebhookEvent {
  id: string;
  organization_id?: string;
  provider: 'razorpay' | 'twilio' | 'meta_whatsapp' | 'resend';
  event_type: string;
  provider_event_id: string;
  payload: {
    [key: string]: unknown;
  };
  is_processed: boolean;
  processed_at?: string;
  error_message?: string;
  created_at: string;
}

// ==========================================================//
// RELATIONAL TYPES (with relations)
// ============================================================

export interface InvoiceWithRelations extends Invoice {
  customer: Customer;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export interface CustomerWithRelations extends Customer {
  invoices?: Invoice[];
  communications?: Communication[];
}

export interface OrganizationWithRelations extends Organization {
  members: OrganizationMember[];
  invoices: Invoice[];
  subscriptions?: Subscription;
}

// ==========================================================//
// INPUT TYPES FOR CREATION/UPDATES
// ============================================================

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  currency?: string;
  timezone?: string;
}

export interface CreateCustomerInput {
  organization_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  whatsapp_number?: string;
}

export interface CreateInvoiceInput {
  customer_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency?: string;
  items: InvoiceItemInput[];
  status?: invoice_status;
  notes?: string;
  terms_and_conditions?: string;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export interface CreatePaymentLinkInput {
  invoice_id: string;
  customer_id: string;
  provider?: string;
  amount?: number;
  currency?: string;
  expire_days?: number;
}

export interface CreateFollowUpRuleInput {
  organization_id: string;
  name: string;
  channel: communication_channel;
  delay_days: number;
  template_body: string;
  template_subject?: string;
  escalation_priority?: number;
  include_payment_link?: boolean;
  include_qr_code?: boolean;
}

export interface ScheduleFollowUpInput {
  invoice_id: string;
  customer_id: string;
  promised_date?: string;
  channel: communication_channel;
}

export interface SendNotificationInput {
  organization_id: string;
  customer_id: string;
  invoice_id?: string;
  channel: communication_channel;
  recipient: string;
  subject?: string;
  content: string;
  template?: string;
}

export interface ProcessWebhookInput {
  provider: string;
  provider_payment_id: string;
  provider_event_id: string;
  event: string;
  status?: string;
}