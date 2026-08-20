import React from 'react';

export interface StatCardProps {
  title: string;
  value: string;
  icon?: React.ReactNode;
  Icon?: React.ComponentType<{ className?: string }>;
  trend?: string;
  trendUp?: boolean;
  trendFlat?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  Icon,
  trend,
  trendUp,
  trendFlat,
}) => {
  const trendClass = trendUp
    ? 'trend-up'
    : trendFlat
    ? 'trend-flat'
    : 'trend-down';

  return (
    <div className="stat-card bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-lg hover:border-slate-600 transition-colors duration-300">
      <div className="stat-top flex items-center justify-between">
        <span className="eyebrow text-slate-400 text-sm">{title}</span>
        {Icon ? <Icon className="w-5 h-5 text-emerald-400" /> : icon}
      </div>
      <div className="stat-value text-3xl font-bold mt-3">{value}</div>
      {trend && (
        <div className="stat-detail mt-2 flex items-center gap-1">
          <span className={`trend ${trendClass}`}>
            {trend}
          </span>
        </div>
      )}
    </div>
  );
};