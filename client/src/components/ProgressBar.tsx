import React from 'react';

export const ProgressBar: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const percent = Math.max(0, Math.min(100, value));

  return (
    <div className="bg-slate-800/50 rounded-full h-2.5 overflow-x-hidden">
      <div
        className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
      <span className="text-xs text-slate-400 ml-2">{label}</span>
    </div>
  );
};