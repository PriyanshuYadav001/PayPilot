import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import type { AuthView } from './AuthGate';

interface ForgotPasswordPageProps {
  onSwitch: (view: AuthView) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onSwitch }) => {
  const { resetPassword, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const ok = await resetPassword(email);
    setSubmitting(false);
    if (ok) setSent(true);
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We&apos;ll email you a secure link to reset your password"
      footer={
        <button
          onClick={() => onSwitch('login')}
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Back to sign in
        </button>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <FormAlert tone="success">
            If an account exists for {email || 'this email'}, a password reset link has been sent.
          </FormAlert>
          <button
            onClick={() => onSwitch('login')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            Return to sign in
          </button>
        </div>
      ) : (
        <form noValidate className="space-y-4" onSubmit={handleSubmit} aria-label="Forgot password">
          {error && <FormAlert>{error}</FormAlert>}

          <div>
            <label htmlFor="forgot-email" className="block text-xs font-medium text-slate-400 mb-1.5">
              Email address
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              placeholder="you@company.com"
              className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            {submitting ? 'Sending reset link...' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
};
