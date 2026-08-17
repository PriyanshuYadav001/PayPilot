import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import type { AuthView } from './AuthGate';

interface LoginPageProps {
  onSwitch: (view: AuthView) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitch }) => {
  const { signIn, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    await signIn(email, password);
    setSubmitting(false);
  };

  return (
    <AuthLayout
      title="Sign in to PayPilot"
      subtitle="Access your accounts receivable dashboard"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <button
            onClick={() => onSwitch('signup')}
            className="font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Create one
          </button>
        </>
      }
    >
      <form noValidate className="space-y-4" onSubmit={handleSubmit} aria-label="Sign in">
        {error && <FormAlert>{error}</FormAlert>}

        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-slate-400 mb-1.5">
            Email address
          </label>
          <input
            id="login-email"
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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="block text-xs font-medium text-slate-400">
              Password
            </label>
            <button
              type="button"
              onClick={() => onSwitch('forgot')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              Forgot password?
            </button>
          </div>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            placeholder="••••••••"
            className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
};
