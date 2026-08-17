import React from 'react';
import { DollarSign, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { StatCard } from '../components/StatCard';

export const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Accounts Receivable Overview</h1>
        <p className="text-sm text-slate-400 mt-1">Real-time status of invoices, aging buckets, and collection metrics.</p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Outstanding AR"
          value="₹0.00"
          icon={<DollarSign className="w-4 h-4" />}
        />
        <StatCard
          title="Overdue Amount"
          value="₹0.00"
          icon={<AlertCircle className="w-4 h-4" />}
        />
        <StatCard
          title="Average DSO"
          value="0 Days"
          icon={<Clock className="w-4 h-4" />}
        />
        <StatCard
          title="Recovery Rate"
          value="100%"
          icon={<CheckCircle className="w-4 h-4" />}
        />
      </div>

      {/* AR Aging Buckets Outline */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-200 mb-4">AR Aging Distribution</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
            <span className="text-xs font-medium text-slate-400">1 - 30 Days</span>
            <div className="text-lg font-bold text-slate-200 mt-1">₹0.00</div>
          </div>
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
            <span className="text-xs font-medium text-amber-400">31 - 60 Days</span>
            <div className="text-lg font-bold text-slate-200 mt-1">₹0.00</div>
          </div>
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
            <span className="text-xs font-medium text-orange-400">61 - 90 Days</span>
            <div className="text-lg font-bold text-slate-200 mt-1">₹0.00</div>
          </div>
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
            <span className="text-xs font-medium text-rose-400">90+ Days</span>
            <div className="text-lg font-bold text-slate-200 mt-1">₹0.00</div>
          </div>
        </div>
      </div>
    </div>
  );
};
