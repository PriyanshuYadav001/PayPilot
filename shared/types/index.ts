// Shared Domain Types across Server & Client

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled';

export type PaymentLinkStatus = 'active' | 'paid' | 'expired' | 'cancelled';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet' | 'bank_transfer' | 'cheque' | 'cash' | 'other';
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string;
  paymentLinkId?: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  referenceNumber?: string;
  paidAt: string;
  notes?: string;
  createdAt: string;
}

export interface PaymentLink {
  id: string;
  organizationId: string;
  invoiceId: string;
  provider: string;
  providerLinkId: string;
  shortUrl: string;
  qrCodeUrl?: string;
  amount: number;
  currency: string;
  status: PaymentLinkStatus;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  invoiceNumber?: string;
}

export type CommunicationChannel = 'email' | 'whatsapp' | 'call' | 'sms';
export type MessageDirection = 'outbound' | 'inbound';
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'bounced';

export interface Communication {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceId?: string;
  channel: CommunicationChannel;
  direction: MessageDirection;
  message: string;
  status: DeliveryStatus;
  providerMessageId?: string;
  sentAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type PromiseStatus = 'pending' | 'fulfilled' | 'missed' | 'cancelled';

export interface PaymentPromise {
  id: string;
  organizationId: string;
  invoiceId: string;
  customerId: string;
  communicationId?: string;
  promisedDate: string;
  promisedAmount?: number;
  confidenceScore?: number;
  status: PromiseStatus;
  source: 'manual' | 'ai_extracted' | 'customer_portal' | 'webhook';
  aiExtractedQuote?: string;
  notes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export type DisputeStatus = 'open' | 'under_review' | 'resolved_rejected' | 'resolved_credited' | 'resolved_paid';
export type CallStatus = 'queued' | 'ringing' | 'in_progress' | 'completed' | 'busy' | 'no_answer' | 'failed';

export interface Call {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceId?: string;
  followUpTaskId?: string;
  provider: string;
  providerCallId?: string;
  fromNumber: string;
  toNumber: string;
  status: CallStatus;
  durationSeconds: number;
  recordingUrl?: string;
  transcript?: string;
  summary?: string;
  metadata: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export type AnalysisIntent = 'PAYMENT_PROMISE' | 'PAYMENT_COMPLETED' | 'PAYMENT_DELAY' | 'DISPUTE' | 'REQUEST_INVOICE' | 'REQUEST_PAYMENT_LINK' | 'QUESTION' | 'STOP_REMINDERS' | 'OTHER';

export interface CallAnalysisResult {
  primaryIntent: AnalysisIntent;
  sentiment: 'positive' | 'neutral' | 'frustrated' | 'angry';
  confidence: number;
  summary: string;
  extractedPromises: Array<{ promisedDate: string; promisedAmount?: number; confidence: number; quote: string }>;
  extractedDisputes: Array<{ category: string; reason: string; confidence: number; quote: string }>;
  customerConcerns: Array<{ topic: string; detail: string; quote?: string }>;
  injectionDetected: boolean;
  warnings: string[];
  promiseIds: string[];
  disputeIds: string[];
  promiseCount: number;
  disputeCount: number;
  concernCount: number;
  processedAt: string;
}

export type PlanTier = 'free_trial' | 'starter' | 'growth' | 'scale' | 'enterprise';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
export type UsageMetric = 'invoices_created' | 'whatsapp_sent' | 'emails_sent' | 'calls_made' | 'ai_analyses';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  currency: string;
  timezone: string;
  billingAddress: Record<string, unknown>;
  taxId?: string;
  supportEmail?: string;
  supportPhone?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: MemberRole;
  invitedEmail?: string;
  status: 'active' | 'invited' | 'suspended';
  createdAt: string;
  updatedAt: string;
  profile?: Profile;
}

export interface Customer {
  id: string;
  organizationId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  whatsappNumber?: string;
  gstin?: string;
  billingAddress: Record<string, unknown>;
  creditPeriodDays: number;
  isDnd: boolean;
  notes?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  discount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  pdfUrl?: string;
  notes?: string;
  termsAndConditions?: string;
  isFollowUpActive: boolean;
  followUpPausedUntil?: string;
  lastFollowUpAt?: string;
  nextFollowUpAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  customer?: Customer;
  items?: InvoiceItem[];
}

export interface FollowUpRule {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
  daysRelativeToDue: number;
  channel: CommunicationChannel;
  templateSubject?: string;
  templateBody: string;
  templateIdExternal?: string;
  escalationPriority: number;
  includePaymentLink: boolean;
  includeQrCode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpTask {
  id: string;
  organizationId: string;
  invoiceId: string;
  ruleId?: string;
  channel: CommunicationChannel;
  scheduledFor: string;
  executedAt?: string;
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
