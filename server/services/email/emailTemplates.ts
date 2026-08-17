export interface EmailTemplateData {
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  amountDue: number;
  currency: string;
  dueDate: string;
  paymentLinkUrl?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PayPilot</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: #059669; padding: 24px 32px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
    .body { padding: 32px; color: #334155; line-height: 1.6; }
    .body h2 { color: #1e293b; font-size: 18px; margin: 0 0 16px 0; }
    .body p { margin: 0 0 12px 0; font-size: 14px; }
    .detail-box { background-color: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .detail-label { color: #64748b; }
    .detail-value { color: #1e293b; font-weight: 600; }
    .cta-button { display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 20px 0; }
    .cta-button:hover { background-color: #047857; }
    .footer { background-color: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0; }
    .footer p { color: #94a3b8; font-size: 12px; margin: 0 0 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PayPilot</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>PayPilot &mdash; Automated Payment Collections</p>
      <p>This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

export function buildInvoiceReminderEmail(data: EmailTemplateData): { html: string; text: string; subject: string } {
  const subject = `Reminder: Invoice ${data.invoiceNumber} is due in 3 days`;
  const html = baseLayout(`
    <h2>Payment Reminder</h2>
    <p>Hi ${escapeHtml(data.customerName)},</p>
    <p>This is a friendly reminder that invoice <strong>${escapeHtml(data.invoiceNumber)}</strong> issued by <strong>${escapeHtml(data.businessName)}</strong> is due in 3 days.</p>
    <div class="detail-box">
      <div class="detail-row">
        <span class="detail-label">Invoice Number</span>
        <span class="detail-value">${escapeHtml(data.invoiceNumber)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount Due</span>
        <span class="detail-value">${escapeHtml(formatCurrency(data.amountDue, data.currency))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Due Date</span>
        <span class="detail-value">${escapeHtml(data.dueDate)}</span>
      </div>
    </div>
    <p>Please make the payment before the due date to avoid any late fees.</p>
    ${data.paymentLinkUrl ? `<div style="text-align:center"><a href="${escapeHtml(data.paymentLinkUrl)}" class="cta-button">Pay Now</a></div>` : ''}
  `);
  return { html, text: plainTextFromHtml(html), subject };
}

export function buildOverdueReminderEmail(data: EmailTemplateData): { html: string; text: string; subject: string } {
  const subject = `Overdue Notice: Invoice ${data.invoiceNumber} — Action Required`;
  const html = baseLayout(`
    <h2 style="color:#dc2626">Overdue Invoice</h2>
    <p>Dear ${escapeHtml(data.customerName)},</p>
    <p>Our records indicate that invoice <strong>${escapeHtml(data.invoiceNumber)}</strong> issued by <strong>${escapeHtml(data.businessName)}</strong> is past its due date. Please settle the outstanding balance at your earliest convenience.</p>
    <div class="detail-box">
      <div class="detail-row">
        <span class="detail-label">Invoice Number</span>
        <span class="detail-value">${escapeHtml(data.invoiceNumber)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount Due</span>
        <span class="detail-value" style="color:#dc2626">${escapeHtml(formatCurrency(data.amountDue, data.currency))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Due Date</span>
        <span class="detail-value">${escapeHtml(data.dueDate)}</span>
      </div>
    </div>
    <p>Prompt payment helps maintain a positive business relationship. If you have already made the payment, please disregard this notice.</p>
    ${data.paymentLinkUrl ? `<div style="text-align:center"><a href="${escapeHtml(data.paymentLinkUrl)}" class="cta-button" style="background-color:#dc2626">Pay Now</a></div>` : ''}
  `);
  return { html, text: plainTextFromHtml(html), subject };
}

export function buildPaymentLinkEmail(data: EmailTemplateData): { html: string; text: string; subject: string } {
  const subject = `Pay Invoice ${data.invoiceNumber} — Secure Payment Link`;
  const html = baseLayout(`
    <h2>Secure Payment Link</h2>
    <p>Hi ${escapeHtml(data.customerName)},</p>
    <p>Here is the secure payment link for invoice <strong>${escapeHtml(data.invoiceNumber)}</strong> issued by <strong>${escapeHtml(data.businessName)}</strong>. You can complete the payment using any UPI app, credit/debit card, or net banking.</p>
    <div class="detail-box">
      <div class="detail-row">
        <span class="detail-label">Invoice Number</span>
        <span class="detail-value">${escapeHtml(data.invoiceNumber)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount Due</span>
        <span class="detail-value">${escapeHtml(formatCurrency(data.amountDue, data.currency))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Due Date</span>
        <span class="detail-value">${escapeHtml(data.dueDate)}</span>
      </div>
    </div>
    ${data.paymentLinkUrl ? `<div style="text-align:center"><a href="${escapeHtml(data.paymentLinkUrl)}" class="cta-button">Pay ${escapeHtml(formatCurrency(data.amountDue, data.currency))}</a></div>` : '<p>No payment link is available for this invoice. Please contact the business for a payment link.</p>'}
    <p style="font-size:12px;color:#94a3b8;margin-top:24px">This link is unique to this invoice and is valid for 7 days.</p>
  `);
  return { html, text: plainTextFromHtml(html), subject };
}

export function buildPaymentConfirmationEmail(data: EmailTemplateData): { html: string; text: string; subject: string } {
  const subject = `Payment Confirmed — Invoice ${data.invoiceNumber}`;
  const html = baseLayout(`
    <h2 style="color:#059669">Payment Received</h2>
    <p>Hi ${escapeHtml(data.customerName)},</p>
    <p>Thank you! We have received your payment for invoice <strong>${escapeHtml(data.invoiceNumber)}</strong> issued by <strong>${escapeHtml(data.businessName)}</strong>.</p>
    <div class="detail-box">
      <div class="detail-row">
        <span class="detail-label">Invoice Number</span>
        <span class="detail-value">${escapeHtml(data.invoiceNumber)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount Paid</span>
        <span class="detail-value" style="color:#059669">${escapeHtml(formatCurrency(data.amountDue, data.currency))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value" style="color:#059669">Paid</span>
      </div>
    </div>
    <p>A formal receipt will be shared separately if applicable. If you have any questions, please reach out to us.</p>
  `);
  return { html, text: plainTextFromHtml(html), subject };
}

export function buildPaymentPromiseReminderEmail(data: EmailTemplateData & { promiseDate?: string }): { html: string; text: string; subject: string } {
  const promiseNote = data.promiseDate
    ? `<p>You had committed to paying by <strong>${escapeHtml(data.promiseDate)}</strong>. This is a reminder to follow through on that commitment.</p>`
    : '';
  const subject = `Reminder: Payment Promise for Invoice ${data.invoiceNumber}`;
  const html = baseLayout(`
    <h2>Payment Promise Reminder</h2>
    <p>Hi ${escapeHtml(data.customerName)},</p>
    <p>This is a reminder regarding invoice <strong>${escapeHtml(data.invoiceNumber)}</strong> issued by <strong>${escapeHtml(data.businessName)}</strong>.</p>
    ${promiseNote}
    <div class="detail-box">
      <div class="detail-row">
        <span class="detail-label">Invoice Number</span>
        <span class="detail-value">${escapeHtml(data.invoiceNumber)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount Due</span>
        <span class="detail-value">${escapeHtml(formatCurrency(data.amountDue, data.currency))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Due Date</span>
        <span class="detail-value">${escapeHtml(data.dueDate)}</span>
      </div>
    </div>
    <p>If you have already made the payment, please disregard this message.</p>
    ${data.paymentLinkUrl ? `<div style="text-align:center"><a href="${escapeHtml(data.paymentLinkUrl)}" class="cta-button">Pay Now</a></div>` : ''}
  `);
  return { html, text: plainTextFromHtml(html), subject };
}
