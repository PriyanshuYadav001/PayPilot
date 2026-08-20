import React, { useEffect, useState } from 'react';
import { DollarSign, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../hooks/useOrganization';
import { getAnalyticsOverview, getAgingBuckets, type AgingBuckets, type AnalyticsOverview } from '../lib/analytics';

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

export const Dashboard: React.FC = () => {
  const { session } = useAuth();
  const { currentOrg } = useOrganization();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [aging, setAging] = useState<AgingBuckets | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token || !currentOrg?.id) return;
    Promise.all([
      getAnalyticsOverview(currentOrg.id, session.access_token),
      getAgingBuckets(currentOrg.id, session.access_token),
    ]).then(([nextOverview, nextAging]) => {
      setOverview(nextOverview);
      setAging(nextAging);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load dashboard.'));
  }, [currentOrg?.id, session?.access_token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PayPilot</h1>
        <p className="text-slate-400 text-sm">Autonomous B2B Collections Platform</p>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Outstanding AR" value={overview ? money(overview.totalOutstanding) : '—'} Icon={DollarSign} trend="—" trendFlat />
        <StatCard title="Overdue Amount" value={overview ? money(overview.overdueAmount) : '—'} Icon={AlertCircle} trend="—" trendFlat />
        <StatCard title="Avg. DSO" value={overview ? `${overview.averageDsoDays} Days` : '—'} Icon={Clock} trend="—" trendFlat />
        <StatCard title="Recovery Rate" value={overview ? `${overview.collectionEfficiencyRate}%` : '—'} Icon={CheckCircle} trend="—" trendFlat />
      </div>
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 shadow-2xl">
        <h2 className="text-lg font-medium text-slate-200 mb-4">AR Aging Distribution</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-medium">
          <div className="py-2 px-3 rounded-lg bg-slate-900/50 border border-slate-800"><span className="text-emerald-400">Current</span><div className="mt-1 text-slate-200">{aging ? money(aging.current) : '—'}</div></div>
          <div className="py-2 px-3 rounded-lg bg-slate-900/50 border border-slate-800"><span className="text-amber-400">1-30 Days</span><div className="mt-1 text-slate-200">{aging ? money(aging.bucket1_30) : '—'}</div></div>
          <div className="py-2 px-3 rounded-lg bg-slate-900/50 border border-slate-800"><span className="text-rose-400">31-60 Days</span><div className="mt-1 text-slate-200">{aging ? money(aging.bucket31_60) : '—'}</div></div>
          <div className="py-2 px-3 rounded-lg bg-slate-900/50 border border-slate-800"><span className="text-rose-400">90+ Days</span><div className="mt-1 text-slate-200">{aging ? money(aging.bucket90Plus) : '—'}</div></div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
