import React from 'react';
import { Plus, Bell } from 'lucide-react';
import { DEFAULT_FOLLOW_UP_RULES } from '@shared/constants';

export const FollowUps: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Follow-up Cadence Rules</h1>
          <p className="text-sm text-slate-400 mt-1">Configure automated escalation workflows across Email, WhatsApp, and Voice channels.</p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          <span>New Cadence Rule</span>
        </button>
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {DEFAULT_FOLLOW_UP_RULES.map((rule, idx) => (
          <div
            key={idx}
            className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-200">{rule.name}</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded font-mono font-medium bg-slate-700/60 text-slate-300">
                    {rule.daysRelativeToDue === 0
                      ? 'Due date'
                      : rule.daysRelativeToDue < 0
                      ? `${Math.abs(rule.daysRelativeToDue)} days before`
                      : `${rule.daysRelativeToDue} days after`}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {rule.channel}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">{rule.templateBody}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-medium">
                Active
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
