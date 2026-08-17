import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toDataURL } from 'qrcode';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle,
  Hash,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  ApiError,
  createPublicCheckout,
  getPublicPaymentPage,
} from '../../lib/publicPayments';
import type { PublicCheckout, PublicPaymentPage, PublicPaymentStatus } from '../../lib/publicPayments';
import { loadRazorpayCheckoutScript, openRazorpayCheckout } from '../../lib/razorpayCheckout';

type Phase = 'loading' | 'ready' | 'paying' | 'confirming' | 'paid' | 'error';

const STATUS_STYLES: Record<PublicPaymentStatus, string> = {
  open: 'bg-sky-500/10 text-sky-300 border-sky-500/40',
  partially_paid: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  paid: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  expired: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
  cancelled: 'bg-slate-500/10 text-slate-300 border-slate-600/40',
};

const STATUS_LABELS: Record<PublicPaymentStatus, string> = {
  open: 'Payment Open',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  expired: 'Link Expired',
  cancelled: 'Not Active',
};

const cardClass = 'bg-slate-800/80 border border-slate-700/60 rounded-xl shadow-sm';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700/60 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors';

function extractToken(): string | null {
  const match = window.location.pathname.match(/^\/pay\/([^/]+)/);
  return match?.[1] ?? null;
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[Number(month) - 1] ?? month} ${year}`;
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
}

export const CustomerPaymentPage: React.FC = () => {
  const token = useMemo(extractToken, []);
  const [phase, setPhase] = useState<Phase>('loading');
  const [page, setPage] = useState<PublicPaymentPage | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingNote, setConfirmingNote] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkStatus = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const data = await getPublicPaymentPage(token);
      setPage(data);
      if (data.paymentStatus === 'paid' || data.paymentStatus === 'partially_paid') {
        setPhase('paid');
        setConfirmingNote(null);
        return true;
      }
    } catch {
      // Transient failure; keep polling.
    }
    return false;
  }, [token]);

  const loadPage = useCallback(async () => {
    if (!token) {
      setPhase('error');
      setErrorMessage('This payment link is invalid.');
      return;
    }
    setPhase('loading');
    setErrorMessage(null);
    try {
      const data = await getPublicPaymentPage(token);
      setPage(data);
      setPhase(data.paymentStatus === 'paid' ? 'paid' : 'ready');

      const qrTarget = data.paymentLinkUrl || `${window.location.origin}${window.location.pathname}`;
      try {
        setQrDataUrl(
          await toDataURL(qrTarget, {
            width: 176,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0f172a', light: '#ffffff' },
          })
        );
      } catch {
        setQrDataUrl(null);
      }
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof ApiError ? err.message : 'Failed to load payment details.');
    }
  }, [token]);

  useEffect(() => {
    void loadPage();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [loadPage]);

  const handlePayNow = async () => {
    if (!token || !page) return;
    if (!page.providerConfigured) {
      setErrorMessage('Online payments are temporarily unavailable. Please contact the business to complete this payment.');
      return;
    }
    setPhase('paying');
    setErrorMessage(null);

    let checkout: PublicCheckout;
    try {
      checkout = await createPublicCheckout(token);
      await loadRazorpayCheckoutScript();
    } catch (err) {
      setPhase('ready');
      setErrorMessage(err instanceof ApiError ? err.message : 'Failed to start payment. Please try again.');
      return;
    }

    try {
      await openRazorpayCheckout({
        keyId: checkout.keyId ?? '',
        orderId: checkout.orderId,
        amountPaise: checkout.amountPaise,
        currency: checkout.currency,
        businessName: checkout.businessName,
        prefill: checkout.prefill,
      });
    } catch {
      // Checkout window dismissed or the payment failed — allow a retry.
      setPhase('ready');
      return;
    }

    // The invoice is only reconciled by the payment webhook, so poll the
    // server until it reflects the payment. We never fake success here.
    setPhase('confirming');
    setConfirmingNote('Your payment was received. Confirming with the payment provider...');

    const poll = async (attempt: number) => {
      const confirmed = await checkStatus();
      if (confirmed) return;
      if (attempt >= 12) {
        setConfirmingNote(
          'We could not confirm your payment yet. This can take a moment — please check your payment status again shortly.'
        );
        return;
      }
      pollTimerRef.current = setTimeout(() => void poll(attempt + 1), 2500);
    };
    void poll(0);
  };

  const handleCheckStatus = async () => {
    setConfirmingNote(null);
    const confirmed = await checkStatus();
    if (!confirmed) {
      setConfirmingNote('Payment not confirmed yet. Please check again shortly.');
    }
  };

  if (!token) {
    return (
      <Shell>
        <MessageCard
          icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
          title="Invalid payment link"
          message="The payment link you opened is not valid."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      {phase === 'loading' && (
        <div className={`${cardClass} p-10 flex items-center justify-center`}>
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      )}

      {phase === 'error' && (
        <MessageCard
          icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
          title="Unable to load this payment"
          message={errorMessage ?? 'The payment link may have expired or is no longer available.'}
          action={
            <button onClick={() => void loadPage()} className={secondaryButtonClass}>
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          }
        />
      )}

      {page && (phase === 'ready' || phase === 'paying' || phase === 'confirming' || phase === 'paid') && (
        <div className={`${cardClass} p-6 space-y-6`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-emerald-400">
                <Building2 className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium uppercase tracking-wider">Payment to</span>
              </div>
              <h1 className="text-xl font-semibold text-white mt-1 truncate">{page.businessName}</h1>
            </div>
            <span className={`px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap ${STATUS_STYLES[page.paymentStatus]}`}>
              {STATUS_LABELS[page.paymentStatus]}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <DetailRow icon={Hash} label="Invoice number" value={page.invoiceNumber} />
            <DetailRow icon={CalendarDays} label="Invoice date" value={formatDate(page.issueDate)} />
            <DetailRow icon={CalendarDays} label="Due date" value={formatDate(page.dueDate)} />
          </div>

          <div className="border-t border-slate-700/60 pt-4 space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-sm text-slate-400">Amount due</span>
              <span aria-label="Amount due" className="text-3xl font-bold text-white tabular-nums">
                {formatMoney(page.payableAmount, page.currency)}
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Total amount</span>
                <span className="text-slate-300 tabular-nums">{formatMoney(page.totalAmount, page.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Balance</span>
                <span className="text-slate-300 tabular-nums">{formatMoney(page.amountDue, page.currency)}</span>
              </div>
            </div>
          </div>

          {phase === 'ready' && page.providerConfigured && (
            <button onClick={() => void handlePayNow()} className={`${primaryButtonClass} w-full`}>
              Pay Now <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {phase === 'ready' && !page.providerConfigured && (
            <p className="text-sm text-amber-300/90 text-center">
              Online payments are temporarily unavailable. Please contact {page.businessName} to complete this payment.
            </p>
          )}
          {phase === 'paying' && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> Opening secure payment window…
            </div>
          )}
          {phase === 'confirming' && (
            <div className="space-y-3">
              <div className="flex items-start justify-center gap-2 text-sm text-slate-300">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500 mt-0.5 shrink-0" />
                <span>{confirmingNote ?? 'Confirming payment…'}</span>
              </div>
              <button onClick={() => void handleCheckStatus()} className={`${secondaryButtonClass} w-full`}>
                Check payment status
              </button>
            </div>
          )}
          {phase === 'paid' && (
            <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
              <CheckCircle className="w-4 h-4 shrink-0" /> This invoice has been paid in full.
            </div>
          )}

          {phase === 'ready' && errorMessage && (
            <p className="flex items-start gap-2 text-sm text-rose-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {errorMessage}
            </p>
          )}

          <div className="border-t border-slate-700/60 pt-4">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
              <QrCode className="w-4 h-4" /> Scan to pay
            </div>
            {qrDataUrl ? (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={qrDataUrl}
                  alt="Payment QR code"
                  className="w-44 h-44 bg-white p-2 rounded-lg"
                />
                {page.paymentLinkUrl && (
                  <a
                    href={page.paymentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    Prefer to pay in a new window? Open the secure payment page
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">QR code is unavailable for this link.</p>
            )}
          </div>

          <div className="flex items-start gap-2 text-xs text-slate-500 border-t border-slate-700/60 pt-4">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Secure payment powered by Razorpay. Your payment details are encrypted and shared only with the payment
              provider.
            </span>
          </div>
        </div>
      )}
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
    <div className="w-full max-w-md">
      <div className="flex items-center justify-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-sm">
          P
        </div>
        <span className="text-slate-300 font-semibold text-sm tracking-tight">PayPilot</span>
      </div>
      {children}
    </div>
  </div>
);

const DetailRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="flex items-center gap-2 text-slate-400">
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
    <span className="text-slate-200 font-medium">{value}</span>
  </div>
);

const MessageCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}> = ({ icon, title, message, action }) => (
  <div className={`${cardClass} p-8 text-center space-y-3`}>
    <div className="flex items-center justify-center">{icon}</div>
    <h2 className="text-lg font-semibold text-white">{title}</h2>
    <p className="text-sm text-slate-400">{message}</p>
    {action && <div className="pt-2 flex justify-center">{action}</div>}
  </div>
);

export default CustomerPaymentPage;
