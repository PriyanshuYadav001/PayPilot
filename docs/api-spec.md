# PayPilot - REST API Specification

## 1. Global API Standards

- **Base URL**: `/api/v1`
- **Authentication**: `Authorization: Bearer <Supabase_JWT>`
- **Tenant Context**: Verified server-side via Supabase token. For multi-tenant operations, header `X-Organization-Id: <UUID>` is cross-validated against user membership.
- **Content-Type**: `application/json` (or `multipart/form-data` for file uploads)
- **Standard Success Response**:
```json
{
  "success": true,
  "data": {},
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 150,
    "totalPages": 8
  }
}
```
- **Standard Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "You do not have permission to perform this action in this organization.",
    "details": []
  }
}
```

---

## 2. API Endpoints by Domain

### 2.1 Organizations & Membership

| Method | Endpoint | Description | Auth & Roles |
| :--- | :--- | :--- | :--- |
| `GET` | `/organizations` | List all organizations current user belongs to | Any authenticated |
| `POST` | `/organizations` | Create a new organization & set user as `owner` | Any authenticated |
| `GET` | `/organizations/:orgId` | Fetch organization details and settings | Member, Admin, Owner |
| `PATCH` | `/organizations/:orgId` | Update organization profile, branding, currency | Admin, Owner |
| `GET` | `/organizations/:orgId/members` | List team members and their roles | Member, Admin, Owner |
| `POST` | `/organizations/:orgId/members/invite` | Send invitation to new member | Admin, Owner |
| `DELETE` | `/organizations/:orgId/members/:userId` | Remove member from organization | Admin, Owner |

---

### 2.2 Customers (Debtors)

| Method | Endpoint | Description | Query / Body Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/customers` | List customers with search, sort & pagination | `?search=&isDnd=&page=&limit=` |
| `POST` | `/customers` | Create a single customer | `{ companyName, contactName, email, phone, gstin, billingAddress }` |
| `POST` | `/customers/bulk-import` | Upload CSV / Excel of customers | `multipart/form-data (file: CSV)` |
| `GET` | `/customers/:id` | Get customer profile & total outstanding AR | - |
| `PATCH` | `/customers/:id` | Update customer details or toggle DND | `{ isDnd: boolean, ... }` |
| `GET` | `/customers/:id/timeline` | Fetch full interaction & communication log | `?limit=50` |

---

### 2.3 Invoices & AR Management

**Implemented (Phase 7).** Financial fields (`subtotal`, `taxTotal`, `discount`, `totalAmount`, `amountPaid`, `amountDue`) are always computed server-side from line items; client-supplied totals are ignored. Statuses: `draft`, `sent`, `partially_paid`, `paid`, `overdue`, `cancelled`. Effective status is derived at read time (past-due unpaid invoices surface as `overdue`).

| Method | Endpoint | Description | Query / Body Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/invoices` | List invoices with pagination, search, status & customer filter | `?page=&limit=&search=&status=&customerId=&sortBy=&sortOrder=` |
| `POST` | `/invoices` | Create invoice with line items | `{ customerId, invoiceNumber, issueDate, dueDate, currency?, discount?, items: [{ description, quantity, unitPrice, taxRate? }], status?: 'draft'\|'sent', notes?, termsAndConditions? }` |
| `GET` | `/invoices/:id` | Get invoice details, line items & customer | - |
| `PATCH` | `/invoices/:id` | Update invoice (recomputes amounts); `status: 'paid'` settles the balance, `amountPaid` records partial payments | `{ customerId?, invoiceNumber?, issueDate?, dueDate?, currency?, discount?, items?, status?, amountPaid?, notes?, termsAndConditions? }` |
| `DELETE` | `/invoices/:id` | Delete invoice (cascades to line items) | - |
| `POST` | `/invoices/:id/upload` | Upload a PDF/PNG/JPG/JPEG document into the tenant-private bucket (`invoices-private`, path `<organization_id>/invoices/<invoice_id>/file.<ext>`). Validates extension + MIME, enforces a 10MB limit, replaces any prior file. Write access only | `multipart/form-data (file)` |
| `GET` | `/invoices/:id/file` | Return a short-lived (15 min) signed URL for the stored document | - |
| `POST` | `/invoices/upload` | Upload PDF invoice & extract details via OCR/AI | `multipart/form-data (file: PDF)` |
| `POST` | `/invoices/:id/void` | Mark invoice as void / written off | `{ reason: string }` |
| `POST` | `/invoices/:id/record-payment` | Record offline manual payment (Cheque/NEFT) | `{ amount, method, referenceNumber, paidAt, notes }` |

---

### 2.4 Payment Links & Payments

Payment states: `PENDING` → `PROCESSING` → `SUCCESSFUL | FAILED`, then `REFUNDED` or `CANCELLED`.
A payment is **only** marked `SUCCESSFUL` by the provider webhook — never by the
frontend response. Amounts are always computed/validated server-side against the
invoice balance, and partial payments are supported (any amount `0 < amount <= balance`).

| Method | Endpoint | Description | Payload / Response |
| :--- | :--- | :--- | :--- |
| `POST` | `/payment-links` | Create a Razorpay payment link for an invoice (server computes amount) | `{ invoiceId, amount?, expiresInDays? }` -> `{ paymentLink }` |
| `GET` | `/payment-links/:id` | Get payment link + QR status; expired links report `status: 'expired'` | - |
| `POST` | `/payments/create` | Create a provider payment order (pending). Idempotent via `idempotencyKey` | `{ invoiceId, amount?, idempotencyKey? }` -> `{ payment, providerOrderId, amountPaise, keyId }` |
| `GET` | `/invoices/:id/payments` | List payments recorded against an invoice | - |
| `GET` | `/payments` | List all received payments & settlements | `?invoiceId=&customerId=&status=&page=` |

---

### 2.5 Follow-up Rules & Automation Cadence

| Method | Endpoint | Description | Notes |
| :--- | :--- | :--- | :--- |
| `GET` | `/follow-ups/rules` | List organization's follow-up cadence rules | Default rules pre-seeded |
| `POST` | `/follow-ups/rules` | Create or customize follow-up rule | `{ name, daysRelativeToDue, channel, templateBody, ... }` |
| `PATCH` | `/follow-ups/rules/:id` | Enable/disable rule or change messaging | - |
| `DELETE` | `/follow-ups/rules/:id` | Remove custom rule | - |
| `GET` | `/follow-ups/tasks` | View scheduled & queued follow-up executions | `?status=pending&date=` |
| `POST` | `/follow-ups/tasks/:id/execute-now` | Manually trigger immediate execution of a task | Admin, Owner |
| `POST` | `/follow-ups/tasks/:id/cancel` | Cancel an upcoming queued reminder | - |

---

### 2.6 Communications & AI Intelligence

Implemented (Phase 12). The unified communication architecture routes all outbound messages through clean provider interfaces and records every communication in the `communications` timeline. Provider-specific logic (Razorpay, Twilio, Meta, Resend) never appears in routes — only in the service layer. No real providers are wired yet; dispatching on any channel returns `503 COMMUNICATION_PROVIDER_NOT_CONFIGURED`. Email follow-up service (§2.13) is now implemented and records all outbound emails in the unified timeline.

| Method | Endpoint | Description | Payload |
| :--- | :--- | :--- | :--- |
| `GET` | `/communications` | Unified audit trail of sent/received messages | `?channel=&invoiceId=&customerId=&direction=&page=&limit=` |
| `POST` | `/communications/send` | Send an outbound message via the channel's provider and record it | `{ customerId, channel: 'email'\|'whatsapp'\|'call', message, subject?, invoiceId?, metadata? }` |

---

### 2.7 Payment Promises & Dispute Tracking

| Method | Endpoint | Description | Payload / Notes |
| :--- | :--- | :--- | :--- |
| `GET` | `/payment-promises` | List active, kept, and broken payment promises | `?status=active` |
| `POST` | `/payment-promises` | Manually log a payment promise | `{ invoiceId, promisedDate, promisedAmount, notes }` |
| `PATCH` | `/payment-promises/:id` | Update promise status (`kept`, `broken`, `cancelled`) | - |
| `GET` | `/disputes` | List all open and resolved customer disputes | `?status=open` |
| `POST` | `/disputes` | Raise a dispute on an invoice | `{ invoiceId, category, reason }` |
| `POST` | `/disputes/:id/resolve` | Resolve dispute & resume or credit invoice | `{ resolution: 'reject'\|'credit'\|'paid', notes }` |

---

### 2.8 Automated Voice Calls

| Method | Endpoint | Description | Payload |
| :--- | :--- | :--- | :--- |
| `POST` | `/calls/initiate` | Trigger an automated IVR reminder call | `{ invoiceId, customerId, scriptTemplate }` |
| `GET` | `/calls` | Call history, logs, durations, and outcomes | `?status=&page=` |
| `GET` | `/calls/:id/transcript` | Retrieve AI transcript & summary of the call | - |
| `GET` | `/calls/:id/recording-url` | Generate secure signed URL for call audio | Admin, Owner |

---

### 2.9 AR & Recovery Analytics

| Method | Endpoint | Description | Response Keys |
| :--- | :--- | :--- | :--- |
| `GET` | `/analytics/overview` | Total outstanding, overdue amount, DSO, recovery rate | `{ totalOutstanding, overdueAmount, averageDsoDays, collectionEfficiencyRate }` |
| `GET` | `/analytics/aging-buckets` | AR breakdown by 0-30, 31-60, 61-90, 90+ days | `{ current, bucket1_30, bucket31_60, bucket61_90, bucket90Plus }` |
| `GET` | `/analytics/channel-performance` | Conversion rate per follow-up channel | `{ emailConversion, whatsappConversion, callConversion }` |
| `GET` | `/analytics/promise-accuracy` | Promise-to-pay fulfillment percentage | `{ totalPromises, keptPercentage, brokenPercentage }` |

---

### 2.10 SaaS Subscriptions & Usage Metering

| Method | Endpoint | Description | Notes |
| :--- | :--- | :--- | :--- |
| `GET` | `/billing/subscription` | Current plan tier, billing cycle & limits | - |
| `GET` | `/billing/usage` | Real-time usage against plan limits (WhatsApp, AI, etc.) | `{ whatsappUsed, whatsappLimit, aiUsed, aiLimit }` |
| `POST` | `/billing/create-checkout` | Create subscription checkout session | `{ targetTier: 'growth'\|'scale' }` |
| `POST` | `/billing/cancel` | Cancel subscription at period end | - |

---

### 2.11 Provider Webhook Listeners

| Method | Endpoint | Provider | Security / Signature |
| :--- | :--- | :--- | :--- |
| `POST` | `/webhooks/payment` | Razorpay payment `initiated` / `captured` / `failed` / `refunded` / link-paid | `X-Razorpay-Signature` HMAC-SHA256 over the raw body; requires `RAZORPAY_WEBHOOK_SECRET`. Provider is read from the JSON body (`provider`, default `razorpay`). Every event is logged to `webhook_events` with a `UNIQUE(provider, provider_event_id)` idempotency key; replayed events are skipped. Processing runs transaction-safely in the database (SECURITY DEFINER RPCs with row locks): capture confirms the payment and atomically reconciles invoice `amount_paid`/`amount_due`/status and cancels pending/processing follow-up tasks; refund reverses the credited amount. The invoice is only ever reconciled from a verified webhook — never from client claims. |
| `POST` | `/webhooks/whatsapp` | Meta WhatsApp Cloud API / Twilio | Meta app secret / Twilio AuthToken validation |
| `POST` | `/webhooks/twilio` | Twilio Voice & SMS Status Callbacks | Twilio signature verification (`X-Twilio-Signature`) |
| `POST` | `/webhooks/resend` | Resend Email Events (Delivered, Bounced) | Resend Svix webhook signature verification |

---

### 2.12 Public Payment Page (Customer, No Account)

Used by the customer-facing payment page at `/pay/:token`. **Unauthenticated.** The
customer is identified only by the secure `public_token` (a random UUID on
`payment_links`); internal ids (payment link / invoice / organization) are never
returned. The payable amount is always resolved server-side from the stored link
amount and the current invoice balance — client input is ignored.

| Method | Endpoint | Description | Notes |
| :--- | :--- | :--- | :--- |
| `GET` | `/public/payment-links/:token` | Payment page summary | Returns `{ paymentPage }` with business name, invoice number/date, due date, `totalAmount`, `amountPaid`, `amountDue`, `payableAmount`, `paymentStatus` (`open`/`partially_paid`/`paid`/`expired`/`cancelled`), the provider payment-link URL for QR, optional customer name/email, and `providerConfigured`. `404 PAYMENT_LINK_NOT_FOUND` for unknown/disabled links. |
| `POST` | `/public/payment-links/:token/payments` | Start a real provider checkout | Returns `{ checkout: { keyId, orderId, amountPaise, currency, businessName, prefill } }` for Razorpay Checkout. Creates (or reuses an in-flight pending) Razorpay order; amount comes from the server, never the request body. `409 PAYMENT_LINK_EXPIRED` / `PAYMENT_LINK_NOT_ACTIVE` / `INVOICE_ALREADY_PAID`; `503 PAYMENT_PROVIDER_NOT_CONFIGURED`. The invoice is only reconciled by the payment webhook (§2.11). |

---

### 2.13 Email Follow-Up Service

Server-side email follow-up functions that compose branded HTML emails, resolve or create payment links, and record every sent message in the `communications` timeline via the unified communication service. All functions are org-scoped, respect customer DND, and include automatic retry with exponential backoff (3 attempts, 1s/2s/4s delays).

**Functions (internal, called by the follow-up scheduler):**

| Function | Trigger | Email Content |
| :--- | :--- | :--- |
| `sendInvoiceReminder` | 3 days before due date | Friendly reminder with customer name, business name, invoice number, amount due, due date, and secure payment link |
| `sendOverdueReminder` | After due date (escalation) | Formal overdue notice with red-themed CTA, invoice details, and payment link |
| `sendPaymentLink` | On-demand (manual or automated) | Secure payment link email with QR-ready payment URL, amount, and expiry note |
| `sendPaymentConfirmation` | After successful payment | Payment received confirmation with amount paid and invoice number |
| `sendPaymentPromiseReminder` | After customer commits to a date | Reminder of payment commitment with promised date, invoice details, and payment link |

**Provider abstraction:**
- `ResendEmailProvider` implements `IEmailProvider` from `server/services/communication/EmailProvider.ts`
- Initialized from `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` environment variables
- Registered via `registerCommunicationProvider('email', factory)` at startup
- Falls back gracefully when not configured (logs warning, does not throw)

**Retry-safe handling:**
- Every send retries up to 3 times with exponential backoff (1s, 2s, 4s)
- Failed sends are logged with full context (organization, customer, invoice, attempt number)
- All retries and failures are recorded in application logs for debugging

**Payment link resolution:**
- Checks for an existing active (non-expired) payment link for the invoice
- Creates a new payment link via `paymentService.createPaymentLink` if none exists
- Gracefully falls back to no link in email body if payment provider is unavailable

**Every sent email is recorded in `communications`** with channel `email`, direction `outbound`, and metadata including the follow-up type, rule name, and retry attempt.

---

### 2.14 Follow-Up Rule Management

CRUD APIs for configuring automated follow-up cadence rules. Rules define when and how to contact customers relative to an invoice's due date. The `follow_up_rules` and `follow_up_tasks` tables already exist (migrations 010/011). Task execution is **not yet implemented** — this section covers rule configuration only.

| Method | Endpoint | Description | Payload / Notes |
| :--- | :--- | :--- | :--- |
| `GET` | `/follow-up-rules` | List rules for the current organization | `?isActive=true&channel=email&page=1&limit=20&sortBy=escalation_priority&sortOrder=asc` |
| `GET` | `/follow-up-rules/:id` | Get a single rule | Returns `{ rule }` or `404 NOT_FOUND` |
| `POST` | `/follow-up-rules` | Create a new rule | `{ name, daysRelativeToDue, channel: 'email'\|'whatsapp'\|'call', templateBody, templateSubject?, escalationPriority?, includePaymentLink?, includeQrCode?, isActive? }` — returns `201` |
| `PATCH` | `/follow-up-rules/:id` | Update an existing rule | Any subset of the create fields — at least one required |
| `DELETE` | `/follow-up-rules/:id` | Delete a rule | Returns the deleted rule or `404 NOT_FOUND` |

**Rule fields:**
- `name` — human-readable label (2–100 chars)
- `daysRelativeToDue` — negative = before due date, 0 = on due date, positive = overdue days
- `channel` — `email` | `whatsapp` | `call`
- `templateSubject` — optional email subject (max 200 chars)
- `templateBody` — message body with `{{variable}}` placeholders: `{{contact_name}}`, `{{invoice_number}}`, `{{amount}}`, `{{due_date}}`, `{{payment_link}}`, `{{company_name}}`
- `templateIdExternal` — optional external template ID (for Meta/WhatsApp templates)
- `escalationPriority` — integer ≥ 1; lower = higher priority
- `includePaymentLink` — whether to auto-resolve and embed a payment link
- `includeQrCode` — whether to include a QR code in the email
- `isActive` — enable/disable rule without deleting

**Access control:** `GET` requires viewer+ role. `POST`/`PATCH`/`DELETE` require member+ role (owner, admin, member).

**Validation:** All fields validated via Zod schemas. `templateBody` requires 5–5000 chars. `channel` restricted to `email`/`whatsapp`/`call` (no `sms`). Empty PATCH bodies are rejected.

---

### 2.15 Follow-Up Automation Engine

Database-backed scheduler and worker that automatically sends follow-up communications based on configured rules. Runs as a **separate process** from the HTTP server — never uses `setTimeout` for production scheduling.

**Architecture:**
```
server/services/followup/
  ruleMatcher.ts      — scans invoices, matches rules, creates tasks
  taskExecutor.ts     — picks up pending tasks, renders, dispatches, records
  templateRenderer.ts — {{variable}} placeholder substitution
  scheduler.ts        — polling loop (configurable interval, default 60s)
  index.ts            — barrel exports

server/jobs/
  worker.ts           — standalone entry point (npm run worker)
```

**Workflow:**
1. **Scheduler tick** (every 60s) runs rule matching and task execution
2. **Rule matcher** scans active rules × eligible invoices (status `sent`/`overdue`/`partially_paid`, `is_follow_up_active = true`, not paused, customer not DND)
3. For each match (rule's `days_relative_to_due` equals today's offset from invoice due date), creates a `follow_up_tasks` row with `status = 'pending'`
4. **Task executor** claims pending tasks via atomic `UPDATE ... SET status = 'processing' WHERE status = 'pending'` (prevents double-execution across workers)
5. Verifies invoice is still unpaid; cancels if paid
6. Renders template with customer name, business name, invoice number, amount, due date, payment link
7. Dispatches via `communicationService.sendMessage()` (records in `communications` timeline)
8. On success: marks task `completed`, updates invoice `last_follow_up_at`
9. On failure: increments `retry_count`, reschedules with exponential backoff (1min, 2min, 4min); after `max_retries` (default 3), marks `failed`

**Concurrency control:** Atomic `UPDATE ... WHERE status = 'pending'` ensures only one worker processes each task. Safe for multi-worker deployments.

**Idempotency:** Before creating a task, the matcher checks for existing `follow_up_tasks` with the same `invoice_id` + `rule_id` + same-day `created_at`. Duplicates are skipped.

**Tenant isolation:** All queries scoped by `organization_id`. No cross-tenant data access.

**Structured logs:** Every operation logs with context (invoice number, channel, rule name, task ID, error details).

**Local development:**
```bash
# Start the worker alongside the dev server
npm run dev           # starts server + client
npm run worker        # in a separate terminal — starts the follow-up worker

# Custom tick interval (in ms)
TICK_INTERVAL_MS=30000 npm run worker

# The worker polls the database every 60s (default) for:
# - New overdue invoices matching active rules → creates tasks
# - Pending tasks due for execution → sends communications
```

**Environment variables:**
- `TICK_INTERVAL_MS` — scheduler poll interval (default: `60000`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — database access
- `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` — email provider
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — payment link generation

---

### 2.16 Payment Promise Tracking

Record and track customer payment promises. A promise is **not** a payment — only a verified payment can mark an invoice as paid. The system automatically detects missed promises and continues the collection workflow.

**Promise statuses:** `pending` → `fulfilled` | `missed` | `cancelled`

**Promise sources:** `manual` (logged by user), `ai_extracted` (parsed from conversation), `customer_portal` (customer self-service), `webhook` (external system)

#### Endpoints

**`GET /payment-promises`** — List promises (viewer+)
- Query params: `page`, `limit`, `status`, `customerId`, `invoiceId`, `sortBy` (`promised_date`|`created_at`|`status`), `sortOrder` (`asc`|`desc`)
- Returns paginated list with `totalCount`, `totalPages`

**`GET /payment-promises/:id`** — Get single promise (viewer+)

**`POST /payment-promises`** — Create promise (member+)
- Body: `{ invoiceId, customerId, promisedDate (YYYY-MM-DD), promisedAmount?, source?, notes?, communicationId?, confidenceScore?, aiExtractedQuote? }`
- Auto-sets `status: 'pending'`

**`PATCH /payment-promises/:id`** — Update promise (member+)
- Body: any of `{ status, promisedDate, promisedAmount, notes, resolvedAt }`
- Empty bodies rejected

**`DELETE /payment-promises/:id`** — Delete promise (member+)

#### Scheduled Verification (Missed Promise Checker)

Runs in the worker scheduler alongside rule matching and task execution. On each tick:

1. Queries `payment_promises` where `status = 'pending' AND promised_date < today`
2. For each overdue promise, verifies no `successful` payment exists since the promise was created
3. If payment found → marks promise `fulfilled`, sets `resolved_at`
4. If no payment found → marks promise `missed`, sets `resolved_at`
5. Creates a `follow_up_tasks` row to continue collection workflow
6. **Prevents duplicates**: checks for existing tasks on the same invoice+date before inserting

**Key invariant:** A promise is never automatically fulfilled by the promise alone. Only a verified payment (webhook-confirmed) can mark an invoice as paid. The promise tracker merely detects broken promises and re-enters the collection flow.

**Worker integration:** `npm run worker` runs the missed promise checker every tick (default 60s). Configure via `TICK_INTERVAL_MS`.

---

### 2.17 WhatsApp Integration

Full WhatsApp Business API integration via Meta Cloud API. Sends follow-up messages through the unified communication service, handles inbound messages and delivery status via webhooks, and records everything in the communications timeline.

**Architecture:**
```
server/services/whatsapp/
  WhatsAppClient.ts     — Meta Cloud API client (IWhatsAppProvider implementation)
  whatsappService.ts    — sendInvoiceReminder, sendPaymentLink, sendOverdueReminder, sendPaymentPromiseReminder
  index.ts              — barrel exports

server/routes/
  whatsappWebhooks.ts   — POST /webhooks/whatsapp (incoming messages, delivery status, failures)
```

**WhatsApp Provider (`WhatsAppClient.ts`):**
- Implements `IWhatsAppProvider` from the unified communication architecture
- `sendTemplateMessage()` — Meta pre-approved template messages
- `sendTextMessage()` — Free-form text messages (used by follow-up functions)
- `verifyWebhookSignature()` — HMAC-SHA256 verification of incoming webhooks
- Uses Meta Cloud API v21.0

**Follow-Up Functions (`whatsappService.ts`):**
All functions load customer + invoice context, resolve payment links, compose messages, and dispatch via `communicationService.sendMessage()` (which records in the communications timeline). Retry up to 3 times with exponential backoff.

| Function | When to use |
|---|---|
| `sendInvoiceReminder()` | 3 days before due date |
| `sendOverdueReminder()` | Past due date |
| `sendPaymentLink()` | Direct payment link delivery |
| `sendPaymentPromiseReminder()` | Customer promised to pay by X date |

**Message format:** Markdown-style WhatsApp text with bold markers (`*text*`), payment link, and currency formatting.

**Webhook (`POST /api/webhooks/whatsapp`):**

Handles three event types from Meta Cloud API:
1. **Incoming messages** — Customer replies, matched to customers by phone number, recorded as inbound communications
2. **Delivery status** — `sent`, `delivered`, `read` updates on the communications record
3. **Failed messages** — Error details recorded in webhook_events metadata

**Security & Reliability:**
- HMAC-SHA256 signature verification (`x-hub-signature-256` header) using `WHATSAPP_APP_SECRET`
- Idempotent: all events checked against `webhook_events` table (unique on `provider + provider_event_id`)
- Never fakes delivery — status only updates from actual provider callbacks
- GET `/webhooks/whatsapp` supports Meta's webhook verification challenge

**Environment variables:**
- `WHATSAPP_PHONE_NUMBER_ID` — Meta phone number ID
- `WHATSAPP_ACCESS_TOKEN` — Meta API access token
- `WHATSAPP_APP_SECRET` — Meta app secret (webhook verification)
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — Meta WhatsApp Business Account ID
- `WHATSAPP_VERIFY_TOKEN` — Custom token for Meta webhook verification

---

### 2.18 AI-Powered Customer Message Understanding

Classifies incoming customer messages into structured intents with extracted data. Uses a provider-agnostic abstraction — never hard-codes a specific model in business logic.

**Architecture (AI never writes to database):**
```
Customer message
  ↓
AI Provider (classifyMessage)
  ↓
Structured JSON output
  ↓
Zod validation (server/validators/ai.ts)
  ↓
Business rules (date validation, amount sanity, injection detection)
  ↓
ClassifyResult (returned to caller — no DB write)
```

**Files:**
```
server/validators/ai.ts           — Zod schemas for all 9 intents + discriminated union
server/services/ai/
  AIProvider.ts                   — IAIProvider interface + provider registry
  OpenAIProvider.ts               — Concrete implementation (OpenAI-compatible API)
  messageClassifier.ts            — Orchestration: AI → Zod → business rules → result
  index.ts                        — barrel exports
```

#### Intent Classification

| Intent | When | Extracted Fields |
|---|---|---|
| `PAYMENT_PROMISE` | Customer promises to pay by a date | `promisedDate` (required), `promisedAmount` (optional) |
| `PAYMENT_COMPLETED` | Customer says they've paid | `amount`, `referenceNumber` (optional) |
| `PAYMENT_DELAY` | Customer asks for more time | `newExpectedDate`, `reason` (optional) |
| `DISPUTE` | Customer disputes charges | `category` (required), `disputeReason` (required) |
| `REQUEST_INVOICE` | Customer asks for invoice/receipt | — |
| `REQUEST_PAYMENT_LINK` | Customer asks how to pay | — |
| `QUESTION` | General question about invoice/service | `questionTopic` (optional) |
| `STOP_REMINDERS` | Customer asks to stop reminders | — |
| `OTHER` | Doesn't fit any category | — |

#### Output Schema

```json
{
  "intent": "PAYMENT_PROMISE",
  "sentiment": "neutral",
  "confidence": 0.94,
  "summary": "Customer promises to pay on 20 August",
  "promisedDate": "2026-08-20",
  "promisedAmount": 25000
}
```

All intents include: `intent`, `sentiment` (positive|neutral|frustrated|angry), `confidence` (0–1), `summary` (max 500 chars).

#### Prompt Injection Protection

- 12 regex patterns detect injection attempts ("ignore previous instructions", "you are now X", special tokens)
- Detected injection → intent reclassified to `OTHER`, confidence capped at 0.3, summary prefixed with `[Flagged]`
- Logs warning with original intent for audit

#### Business Rules (post-AI, pre-DB)

- `PAYMENT_PROMISE` with past date → reclassified to `OTHER` with warning
- `PAYMENT_COMPLETED` with amount >> invoice amount → flagged for review
- `STOP_REMINDERS` → flagged for human confirmation before opt-out
- `DISPUTE` with short reason → flagged for review
- Confidence always clamped to [0, 1]

#### Provider Abstraction

```typescript
// Register at startup — swap providers without changing business logic
import { registerAIProvider, OpenAIProvider } from './services/ai';
registerAIProvider(new OpenAIProvider());

// Use in any service
import { getAIProvider } from './services/ai';
const result = await getAIProvider().classifyMessage({ rawText, channel });
```

The `IAIProvider` interface works with any OpenAI-compatible API. Configure via env vars:
- `AI_API_KEY` — API key
- `AI_API_BASE_URL` — Endpoint (default: `https://api.openai.com/v1`)
- `AI_MODEL` — Model name (default: `gpt-4o-mini`)

No SDK dependency — uses raw `fetch()` to the Chat Completions API.

---

### 2.19 AI ↔ Payment Promise Integration

Connects the AI message classifier (Phase 18) with payment promise tracking (Phase 16) through an intent processor. This completes the full pipeline from customer message to automated follow-up.

**End-to-end flow:**
```
Customer WhatsApp message: "I'll pay Friday"
  ↓
WhatsApp webhook (POST /webhooks/whatsapp)
  ↓
Record inbound communication
  ↓
AI classifier → PAYMENT_PROMISE { promisedDate: "2026-08-22" }
  ↓
Zod validation (server/validators/ai.ts)
  ↓
Intent processor (server/services/ai/intentProcessor.ts)
  ↓
Business rules (date validation, confidence check)
  ↓
Create payment_promises record (source: "ai_extracted")
  ↓
Scheduled verification (Phase 16 worker)
  ↓
Payment received? → YES: FULFILLED | NO: MISSED → follow-up task
```

**Files:**
```
server/services/ai/intentProcessor.ts  — Routes classified output to business actions
server/routes/whatsappWebhooks.ts      — Wired to call AI + processor on inbound text messages
```

#### Intent Routing

| Intent | Business Action |
|---|---|
| `PAYMENT_PROMISE` | Creates `payment_promises` record via `paymentPromiseService.createPromise()`. Source: `ai_extracted`. Preserves `confidence` and original message as `aiExtractedQuote`. |
| `PAYMENT_COMPLETED` | **NEVER marks invoice as paid.** Flags for verification with warning: "Requires verification against payment records." |
| `PAYMENT_DELAY` | If `newExpectedDate` provided → creates a promise (so missed-promise checker follows up). Otherwise logs for manual follow-up. |
| `DISPUTE` | Creates `disputes` record with category, reason, and metadata (confidence, sentiment, channel). |
| `STOP_REMINDERS` | Flags for human review. Never auto-opts-out without confirmation. |
| `QUESTION` / `REQUEST_*` / `OTHER` | Logged, no database action. |

#### Critical Invariant

> **A customer saying "I paid" NEVER marks the invoice as paid.**
> Only verified payment records (via webhook-confirmed payment entries in the `payments` table) can mark an invoice as paid. The AI system creates promises, disputes, and flags — it never modifies invoice payment status.

#### Webhook Integration

The WhatsApp webhook handler (`POST /webhooks/whatsapp`) now automatically:
1. Records the inbound communication in the `communications` table
2. For text messages only → runs AI classification + intent processing
3. AI failures are logged but do not break the webhook response (always returns 200 to Meta)

```typescript
// In whatsappWebhooks.ts processIncomingMessage():
const { processIntent } = await import('../services/ai/intentProcessor');
const result = await processIntent({
  organizationId,
  customerId,
  communicationId,  // Links AI analysis to the communication record
  channel: 'whatsapp',
  rawMessage: messageBody,
});
```

#### Tests (15 intent processor + 17 classifier = 32 total)

- Creates promise from AI classification with all fields
- Skips promise when no invoice context
- **PAYMENT_COMPLETED never marks invoice** — only flags for verification
- PAYMENT_DELAY creates promise with new date, logs without date
- DISPUTE creates dispute record, skips without invoice
- STOP_REMINDERS flagged for human review
- Prompt injection propagation
- Ambiguous low-confidence output handled
- Missing optional fields handled gracefully
