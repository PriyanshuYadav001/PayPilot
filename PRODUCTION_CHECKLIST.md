# PayPilot - Production Readiness Checklist

## Pre-Deployment Checklist

### Environment Configuration ✓
- [ ] `.env.example` committed to repository (no actual secrets)
- [ ] `.env` created with all required variables filled in
- [ ] `NODE_ENV=production` set
- [ ] `CORS_ORIGIN` set to production frontend domain (not `*`)
- [ ] All placeholder values (`your-...`, `your-key-here`) replaced with real values
- [ ] `SUPABASE_SERVICE_ROLE_KEY` not accessible to client-side code
- [ ] No `dist/` or build artifacts committed to git

### Supabase Configuration ✓
- [ ] All 27 migrations executed successfully
- [ ] RLS (Row Level Security) enabled on all tables
- [ ] Storage buckets `invoices-private` and `call-recordings-private` created
- [ ] Storage bucket policies set to authenticated-only access
- [ ] Custom domain added to Supabase project settings
- [ ] Supabase JWT secret is strong (32+ characters)

### Payment Provider (Razorpay) ✓
- [ ] Razorpay account created and verified
- [ ] `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` configured
- [ ] `RAZORPAY_WEBHOOK_SECRET` configured and webhook registered
- [ ] Webhook URL: `https://your-domain.com/api/v1/webhooks/subscription`
- [ ] Test transactions completed successfully
- [ ] Set to live mode when ready

### Email Provider ✓
- [ ] Email provider account (Resend or SendGrid) created
- [ ] API key configured (`RESEND_API_KEY` or `SENDGRID_API_KEY`)
- [ ] `EMAIL_FROM_ADDRESS` verified in provider dashboard
- [ ] Test email sent successfully
- [ ] Provider supports required email types (invoices, reminders, confirmations)

### WhatsApp Provider ✓
- [ ] WhatsApp provider configured (`meta` or `twilio`)
- [ ] For Meta: `META_WHATSAPP_API_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` all set
- [ ] For Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` set
- [ ] Webhook verified and receiving events
- [ ] Test WhatsApp message sent successfully

### Voice Call Provider (Twilio) ✓
- [ ] Twilio account created and verified
- [ ] `TWILIO_CALL_PHONE_NUMBER` configured (valid Twilio number)
- [ ] `TWILIO_TWIML_APP_SID` configured (or set up TwML apps)
- [ ] Test call made successfully
- [ ] Call workflow tested (initiate → status → recording)

### AI Provider ✓
- [ ] AI provider configured (`gemini` or `openai`)
- [ ] API key (`GEMINI_API_KEY` or `OPENAI_API_KEY`) set
- [ ] AI quota sufficient for expected usage
- [ ] Test AI classification working

### Rate Limiting ✓
- [ ] `RATE_LIMIT_MAX_REQUESTS` set (recommended: 300)
- [ ] `RATE_LIMIT_WINDOW_MS` set (recommended: 900000 = 15 min)
- [ ] Rate limits tested under load

### Authentication & Security ✓
- [ ] Supabase Authentication configured (email provider enabled)
- [ ] RLS policies verified for all tables (organizations, invoices, customers, subscriptions, usage_records, calls)
- [ ] No CORS wildcard in production (`CORS_ORIGIN` restricted)
- [ ] HTTPS/SSL certificate configured and valid
- [ ] Health check endpoint (`/health`) responding
- [ ] No secrets in git history (verified with `git log --all --diff-filter= --name-only`)

### Background Worker ✓
- [ ] Worker started: `npm run worker`
- [ ] Worker processing follow-up tasks correctly
- [ ] Graceful shutdown (`SIGINT`/`SIGTERM`) working
- [ ] Custom `TICK_INTERVAL_MS` configured if needed (default: 60000ms)

### Database ✓
- [ ] All migrations run without errors
- [ ] No missing indexes for query patterns (verified: organizations, invoices, usage_records, customers, subscriptions, calls)
- [ ] Connection string (`SUPABASE_DB_URL`) correct if using external pooler
- [ ] Backup strategy documented

### Analytics & Monitoring ✓
- [ ] `/health` endpoint responding with `status: healthy`
- [ ] Error logging working (no uncaught exceptions)
- [ ] Rate limit metrics visible
- [ ] Worker processing metrics visible

---

## Post-Deployment Verification

### Immediate Checks (within first hour)
- [ ] Server starts without errors (`NODE_ENV=production npm start`)
- [ ] Health check: `GET /health` returns `{"status":"healthy",...}`
- [ ] Authentication: Can login with test user
- [ ] CORS: Frontend can make API calls from configured origin
- [ ] Invoices API: `GET /api/v1/invoices` returns data
- [ ] Subscriptions API: `GET /api/v1/subscription` works
- [ ] Webhooks: Razorpay/Meta webhooks receiving events

### Functional Tests
- [ ] Create invoice through UI and API
- [ ] Send email reminder through UI and API
- [ ] Send WhatsApp reminder through UI and API
- [ ] Make voice call through UI and API
- [ ] AI classification works for sample messages
- [ ] Subscription upgrade/downgrade flow
- [ ] Cancel subscription flow
- [ ] Password reset/login flow

### Load Testing
- [ ] Concurrent users test (minimum 10 simultaneous)
- [ ] Rate limiting activates at configured threshold
- [ ] Database query performance acceptable
- [ ] Worker processes tasks without errors

### Emergency Preparedness
- [ ] Rollback procedure documented and tested
- [ ] Supabase support contacts identified
- [ ] Payment provider support contacts identified
- [ ] Email provider support contacts identified
- [ ] All team members have `.env` access (no committing secrets)

---

## Post-Deployment Timeline

### Day 1
- [ ] Verify all functional tests pass
- [ ] Monitor server logs for errors
- [ ] Monitor Supabase query performance
- [ ] Verify webhook event processing
- [ ] Check worker is running and processing

### Week 1
- [ ] Monitor rate limit hit frequency
- [ ] Check email deliverability rates
- [ ] Verify WhatsApp/call delivery rates
- [ ] Review analytics for normal usage patterns
- [ ] Update documentation if needed

### Month 1
- [ ] Rotate any keys that may have been exposed
- [ ] Performance optimization review
- [ ] Scalability assessment
- [ ] Cost monitoring (Supabase, AI provider, payment provider)
- [ ] Team review and knowledge transfer

---

# Quick Reference - Critical Variables

| Variable | Category | Required? | Production Value |
|----------|----------|-----------|-----------------|
| `NODE_ENV` | Server | Yes | `production` |
| `CORS_ORIGIN` | Server | Yes | `https://your-domain.com` |
| `SUPABASE_URL` | Supabase | Yes | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase | Yes | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Yes | **Keep secret!** From Supabase dashboard |
| `RAZORPAY_KEY_ID` | Payment | Yes | From Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | Payment | Yes | **Keep secret!** From Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Payment | Yes | From Razorpay webhook settings |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` | Email | Yes | From provider dashboard |
| `EMAIL_FROM_ADDRESS` | Email | Yes | Verified address in provider |
| `WHATSAPP_PROVIDER` | WhatsApp | Yes | `meta` or `twilio` |
| `META_WHATSAPP_API_TOKEN` | WhatsApp | (meta) | From Meta Cloud API |
| `TWILIO_AUTH_TOKEN` | WhatsApp/(Calls) | (twilio) | From Twilio dashboard |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | AI | Yes | From AI provider console |
| `RATE_LIMIT_MAX_REQUESTS` | Security | Recommended | `300` |
| `RATE_LIMIT_WINDOW_MS` | Security | Recommended | `900000` (15 min) |

---

# Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-08-17 | Initial production deployment checklist |