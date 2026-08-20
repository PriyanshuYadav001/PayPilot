import React from 'react';

export const StatusBadge = ({ status }: { status: string }) => {
  const statusClasses: Record<string, string> = {
    Healthy: 'bg-emerald-400',
    'Needs attention': 'bg-rose-400',
    Active: 'bg-emerald-400',
    Inactive: 'bg-rose-400',
    Pending: 'bg-amber-400',
    Completed: 'bg-emerald-400',
  };

  const className = statusClasses[status] || 'bg-slate-400';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${className} text-slate-950`}>
      {status}
    </span>
  );
};