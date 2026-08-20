import React, { useEffect, useState } from 'react';
import { Plus, Bell, Loader2 } from 'lucide-react';
import type { FollowUpRule } from '@shared/types';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../hooks/useOrganization';
import { listFollowUpRules, listFollowUpTasks, type FollowUpTaskListItem } from '../lib/followUps';

export const FollowUps: React.FC = () => {
  const { session } = useAuth();
  const { currentOrg } = useOrganization();
  const [rules, setRules] = useState<FollowUpRule[]>([]);
  const [tasks, setTasks] = useState<FollowUpTaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token || !currentOrg?.id) {
      setLoading(false);
      return;
    }
    Promise.all([listFollowUpRules(currentOrg.id, session.access_token), listFollowUpTasks(currentOrg.id, session.access_token)])
      .then(([nextRules, nextTasks]) => { setRules(nextRules); setTasks(nextTasks); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load follow-ups.'))
      .finally(() => setLoading(false));
  }, [currentOrg?.id, session?.access_token]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-100">Follow-up Cadence Rules</h1><p className="text-sm text-slate-400 mt-1">Configure automated escalation workflows across Email, WhatsApp, and Voice channels.</p></div><button className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" />New Cadence Rule</button></div>
      {loading ? <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div> : error ? <p className="text-rose-400">{error}</p> : rules.length === 0 ? <p className="text-slate-400">No follow-up rules configured.</p> : <div className="space-y-3">{rules.map((rule) => <div key={rule.id} className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div className="flex items-start gap-3.5"><div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400 mt-0.5"><Bell className="w-4 h-4" /></div><div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-slate-200">{rule.name}</h3><span className="text-[11px] px-2 py-0.5 rounded font-mono bg-slate-700/60 text-slate-300">{rule.daysRelativeToDue === 0 ? 'Due date' : rule.daysRelativeToDue < 0 ? `${Math.abs(rule.daysRelativeToDue)} days before` : `${rule.daysRelativeToDue} days after`}</span><span className="text-[11px] uppercase bg-emerald-500/10 text-emerald-400">{rule.channel}</span></div><p className="text-xs text-slate-400 mt-1 font-mono">{rule.templateBody}</p></div></div><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${rule.isActive ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 bg-slate-500/10'}`}>{rule.isActive ? 'Active' : 'Inactive'}</span></div>)}</div>}
      <section className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5"><h2 className="text-lg font-semibold text-slate-200 mb-3">Upcoming and recent tasks</h2>{tasks.length === 0 ? <p className="text-sm text-slate-400">No follow-up tasks scheduled.</p> : <div className="space-y-2">{tasks.map((task) => <div key={task.id} className="flex justify-between border-b border-slate-700/60 py-2 text-sm"><span className="text-slate-300">{task.ruleName ?? task.channel} · {task.invoiceNumber} · {task.customerName}</span><span className="text-slate-400">{new Date(task.scheduledFor).toLocaleString()}</span></div>)}</div>}</section>
    </div>
  );
};

export default FollowUps;
