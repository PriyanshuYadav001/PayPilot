# PayPilot - Production Deployment Guide

## Prerequisites

### 1. Supabase Project
- Create a new Supabase project at https://supabase.com
- Enable **Email Authentication** provider
- Enable **Row Level Security (RLS)** on all tables
- Note your project ref, anon key, and service role key

### 2. Database Migrations
Run all 27 migrations in order:

```bash
supabase migration up
# Or run individually:
supabase migration up --include-001_profiles.sql
supabase migration up --include-002_organizations.sql
# ... continue through 027_disputes_v2.sql
```

### 3. Storage Buckets
Create two private storage buckets in Supabase Dashboard:
- `invoices-private` — for invoice PDFs
- `call-recordings-private` — for call recordings

Set bucket policies to authenticated-only access.

### 4. Environment Configuration

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

**Required environment variables** (see `.env.example` for defaults):

| Category | Variable | Description |
|----------|----------|-------------|
| Server | `NODE_ENV` | Set to `production` |
| Server | `PORT` | Port for server (default: 5000) |
| Server | `CORS_ORIGIN` | Frontend URL (e.g., `https://paypilot.io`) |
| Supabase | `SUPABASE_URL` | Your project ref URL |
| Supabase | `SUPABASE_ANON_KEY` | Public project key |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | **Secret** — server-side only |
| Supabase | `SUPABASE_JWT_SECRET` | JWT signing secret |
| Storage | `SUPABASE_INVOICES_BUCKET` | `invoices-private` |
| Storage | `SUPABASE_RECORDINGS_BUCKET` | `call-recordings-private` |
| Payment | `RAZORPAY_KEY_ID` | Test/live key from Razorpay |
| Payment | `RAZORPAY_KEY_SECRET` | Secret from Razorpay |
| Payment | `RAZORPAY_WEBHOOK_SECRET` | Webhook secret from Razorpay |
| Email | `EMAIL_PROVIDER` | `resend` or `sendgrid` |
| Email | `RESEND_API_KEY` / `SENDGRID_API_KEY` | Provider API key |
| Email | `EMAIL_FROM_ADDRESS` | Sender email address |
| WhatsApp | `WHATSAPP_PROVIDER` | `meta` or `twilio` |
| WhatsApp | `META_WHATSAPP_API_TOKEN` / `TWILIO_AUTH_TOKEN` | Provider token |
| WhatsApp | `META_WHATSAPP_PHONE_NUMBER_ID` / `TWILIO_WHATSAPP_NUMBER` | Phone number ID |
| WhatsApp | `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` / `TWILIO_CALL_WEBHOOK_VERIFY_TOKEN` | Webhook verify token |
| Voice Calls | `CALL_PROVIDER` | `twilio` |
| Calls | `TWILIO_CALL_PHONE_NUMBER` | From number for outbound calls |
| AI | `AI_PROVIDER` | `gemini` or `openai` |
| AI | `GEMINI_API_KEY` / `OPENAI_API_KEY` | API key for AI engine |
| Security | `RATE_LIMIT_MAX_REQUESTS` | Max requests per window |
| Security | `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms |

### 5. Server Deployment

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build:server

# Start production server
NODE_ENV=production npm start
```

### 6. Client Deployment

```bash
npm run build:client
# Deploy dist/client/ to your frontend hosting
```

### 7. Background Worker

```bash
# Start the follow-up automation worker
npm run worker

# Or with custom tick interval
TICK_INTERVAL_MS=30000 npm run worker
```

### 8. SSL / HTTPS
- Configure SSL certificate for your domain
- Ensure `APP_URL` and `CORS_ORIGIN` use `https://`
- Supabase requires HTTPS for production

### 9. Domain & DNS
- Add your domain to Supabase project settings
- Configure custom domain in Supabase Dashboard
- Update `APP_URL` in `.env` to match your domain

### 10. Monitoring
- Set up health check monitoring at `/health`
- Monitor Supabase query logs
- Track rate limit hits via `RATE_LIMIT_MAX_REQUESTS`
- Log worker processing errors

---

## Rollback Procedure

If deployment fails:

1. Restore previous `.env` configuration
2. Run `supabase migration revert` to previous migration
3. Redeploy previous version
4. Contact Supabase support if database state is uncertain

---

## Development to Production Checklist

See [PRODUCTION_CHECKLIST.md] for detailed checklist.

---

## Security Checklist

- [ ] No secrets committed to git (verified via `git diff --cached`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only used server-side (never in client)
- [ ] `CORS_ORIGIN` restricted to production frontend domain
- [ ] HTTPS enforced via SSL certificate
- [ ] Rate limits configured (`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`)
- [ ] Supabase RLS policies active on all tables
- [ ] Storage bucket policies set to authenticated-only
- [ ] Webhook secrets (`RAZORPAY_WEBHOOK_SECRET`, `WHATSAPP_APP_SECRET`) kept secure
- [ ] No `placeholder-*` values in production `.env`
- [ ] `NODE_ENV=production` set
- [ ] JWT secret (`SUPABASE_JWT_SECRET`) is strong and unique
- [ ] All API keys rotated and least-privilege

---

See `PRODUCTION_CHECKLIST.md` for the full deployment checklist.