import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface FormAlertProps {
  tone?: 'error' | 'success';
  children: React.ReactNode;
}

export const FormAlert: React.FC<FormAlertProps> = ({ tone = 'error', children }) => {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm ${
        tone === 'error'
          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
};
