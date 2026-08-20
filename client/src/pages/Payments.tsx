import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { StatusBadge as StatusBadgeComp } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../hooks/useOrganization';
import { listPayments, type PaymentListItem } from '../lib/payments';

export const PaymentsPage: React.FC = () => {
  const { session } = useAuth();
  const { currentOrg } = useOrganization();
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token || !currentOrg?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listPayments(currentOrg.id, session.access_token)
      .then((result) => setPayments(result.payments))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load payments.'))
      .finally(() => setLoading(false));
  }, [currentOrg?.id, session?.access_token]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="font-display font-semibold text-2xl text-foreground">Payments</h1><p className="text-sm text-muted-foreground">All received and attempted payments</p></div>
      </div>
      <div className="rounded-xl bg-card border border-border overflow-x-auto">
        {loading ? <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div> : error ? <p className="p-12 text-center text-rose-400">{error}</p> : payments.length === 0 ? <p className="p-12 text-center text-muted-foreground">No payments found.</p> : (
          <table className="w-full">
            <thead><tr className="bg-slate-50"><th className="text-left px-5 py-3 text-xs">Payment ID</th><th className="text-left px-5 py-3 text-xs">Customer</th><th className="text-left px-5 py-3 text-xs">Invoice</th><th className="text-left px-5 py-3 text-xs">Amount</th><th className="text-left px-5 py-3 text-xs">Method</th><th className="text-left px-5 py-3 text-xs">Provider</th><th className="text-left px-5 py-3 text-xs">Date</th><th className="text-left px-5 py-3 text-xs">Status</th></tr></thead>
            <tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-border"><td className="px-5 py-3 font-mono text-xs">PAY-{payment.id.slice(0, 8).toUpperCase()}</td><td className="px-5 py-3 text-sm">{payment.customerName}</td><td className="px-5 py-3 font-mono text-xs">{payment.invoiceNumber}</td><td className="px-5 py-3 font-mono text-sm">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: payment.currency }).format(payment.amount)}</td><td className="px-5 py-3 text-xs">{payment.method}</td><td className="px-5 py-3 text-xs">{payment.provider}</td><td className="px-5 py-3 text-xs">{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : '—'}</td><td className="px-5 py-3"><StatusBadgeComp status={payment.status} /></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PaymentsPage;
