import React from 'react';
import { StatusBadge as StatusBadgeComp } from '../components/StatusBadge';

interface Payment {
  id: string; customer: string; invoice: string; amount: number;
  provider: string; date: string; status: "succeeded" | "failed" | "processing"; method: string;
}

const PAYMENTS = [
  { id: "p1", customer: "Sneha Rao", invoice: "INV-2025-0086", amount: 28000, provider: "Razorpay", date: "Aug 16, 2025", status: "succeeded", method: "UPI" },
  { id: "p2", customer: "Arjun Mehta", invoice: "INV-2025-0083", amount: 42000, provider: "Razorpay", date: "Jul 27, 2025", status: "succeeded", method: "NEFT" },
  { id: "p3", customer: "Kiran Patel", invoice: "INV-2025-0082", amount: 40000, provider: "Razorpay", date: "Jul 19, 2025", status: "succeeded", method: "UPI" },
  { id: "p4", customer: "Kiran Patel", invoice: "INV-2025-0082", amount: 25000, provider: "Razorpay", date: "Jul 14, 2025", status: "failed", method: "Card" },
  { id: "p5", customer: "Priya Sharma", invoice: "INV-2025-0084", amount: 45000, provider: "Razorpay", date: "Jun 30, 2025", status: "succeeded", method: "NEFT" },
];

const STATUS_PAY: Record<"succeeded" | "failed" | "processing", { label: string; bg: string; text: string }> = {
  succeeded: { label: "Succeeded", bg: "#d1fae5", text: "#059669" },
  failed: { label: "Failed", bg: "#fee2e2", text: "#ef4444" },
  processing: { label: "Processing", bg: "#fffbf0", text: "#d97706" },
};

export const PaymentsPage: React.FC = () => {
  return (
    <div className="bg-background">
      <div className="max-w-7xl mx-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display font-semibold text-2xl text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">All received and attempted payments</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Collected", value: "₹5,45,000", sub: "All time", color: "var(--primary)" },
            { label: "This Month", value: "₹70,000", sub: "Aug 2025", color: "#0ea5e9" },
            { label: "Failed Attempts", value: "1", sub: "Needs attention", color: "#ef4444" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-5" style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-medium mb-2 text-muted-foreground">{s.label}</p>
              <p className="font-mono text-2xl font-semibold text-primary">{s.value}</p>
              <p className="text-xs mt-1 text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="font-display font-semibold">Payment History</h3>
            <button className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors" style={{ backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><filter id="filter"><feGaussianBlur stdDeviation="2" /></filter><path d="M22 2L15 22"/><path d="M22 2L11 13"/><path d="M11 13L2 9"/><path d="M15 22L2 13"/></svg> Filter
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "#f8fafc" }}>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Payment ID</th>
                <th className="text-left px-5 py-3 text-sm font-medium">Customer</th>
                <th className="text-left px-5 py-3 font-mono text-xs text-slate-500">Invoice</th>
                <th className="text-left px-5 py-3 font-mono text-sm font-semibold">Amount</th>
                <th className="text-left px-5 py-3 text-xs">Method</th>
                <th className="text-left px-5 py-3 text-xs text-muted-foreground">Provider</th>
                <th className="text-left px-5 py-3 text-xs text-muted-foreground">Date</th>
                <th className="text-left px-5 py-3 text-xs font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {PAYMENTS.map((p, i) => {
                const st = STATUS_PAY[p.status as keyof typeof STATUS_PAY];
                return (
                  <tr key={p.id} className="border-b border-border">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">PAY-{p.id.toUpperCase()}</td>
                    <td className="px-5 py-3.5 text-sm font-medium">{p.customer}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{p.invoice}</td>
                    <td className="px-5 py-3.5 font-mono text-sm font-semibold" style={{ color: p.status === "succeeded" ? "#059669" : "#ef4444" }}>{'₹' + p.amount.toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs px-2 py-1 rounded font-medium" style={{ backgroundColor: "#f1f5f9", color: "#475569" }}>{p.method}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{p.provider}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{p.date}</td>
                    <td className="px-5 py-3.5"><StatusBadgeComp status={st.label} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};