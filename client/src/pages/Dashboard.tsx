import React from 'react';
import { DollarSign, AlertCircle, Clock, CheckCircle, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { StatusBadge as StatusBadgeComp } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { StatCard } from '../components/StatCard';

export const Dashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">PayPilot</h1>
            <p className="text-slate-400 text-sm">Autonomous B2B Collections Platform</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost btn-sm" onClick={() => window.location.href='/settings'}">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 12l2-2m0 0l2-2m-2 2l2 2m2-2l2 2m7-3h9m-9 0h9m-9 0V5a2 2 0 012-2h1a2 2 0 012 2v6.367m-7 0a2.828 2.828 0 114 4L19.629 21H5a2 2 0 01-2-2z"/>
              </svg>
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => window.location.href='/analytics'}">
              Analytics
            </button>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Outstanding AR"
            value="₹4,25,000"
            icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
            trend="+8.4%" trendUp
          />
          <StatCard
            title="Overdue Amount"
            value="₹1,20,000"
            icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
            trend="+3.2%" trendUp
          />
          <StatCard
            title="Avg. DSO"
            value="24 Days"
            icon={<Clock className="w-5 h-5 text-amber-400" />}
            trend="—" trendFlat
          />
          <StatCard
            title="Recovery Rate"
            value="82.4%"
            icon={<CheckCircle className="w-5 h-5 text-emerald-400" />}
            trend="+6.1%" trendUp
          />
        </div>

        {/* AR Aging Distribution */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 shadow-2xl mb-8">
          <h2 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 4h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>
              <path d="M5 10h8v5H5zm8 0v5h4v-5zm4-17a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V-5a2 2 0 0 1 2-2zm-8 5h8v3H5zm4 0h8v3h-8z"/>
            </svg>
            AR Aging Distribution
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-medium py-1">
            <div className="py-1 px-2 rounded-lg bg-slate-900/50 border border-slate-800">
              <span className="text-slate-400">1-30 Days</span>
              <div className="mt-0.5 text-emerald-400 font-medium">₹2,85,000</div>
            </div>
            <div className="py-2 px-3 rounded-lg bg-slate-900/50 border border-slate-800">
              <span className="text-amber-400">31-60 Days</span>
              <div className="mt-0.5 text-amber-400 font-medium">₹1,12,000</div>
            </div>
            <div className="py-2 px-3 rounded-lg bg-slate-900/50 border border-slate-800">
              <span className="text-rose-400">61-90 Days</span>
              <div className="mt-0.5 text-rose-400 font-medium">₹89,000</div>
            </div>
            <div className="py-2 px-3 rounded-lg bg-slate-900/50 border border-slate-800">
              <span className="text-rose-400">90+ Days</span>
              <div className="mt-0.5 text-rose-400 font-medium">₹41,000</div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <button className="btn btn-primary flex-1">
            Create Invoice
          </button>
          <button className="btn btn-outline flex-1">
            Add Customer
          </button>
        </div>
      </div>
    </div>
  );
};