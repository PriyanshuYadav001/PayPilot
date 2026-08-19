import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import { EyeOffIcon, EyeIcon } from 'lucide-react';
import type { AuthView } from './AuthGate';

interface LoginPageProps {
  onSwitch: (view: AuthView) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitch }) => {
  const { signIn, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    await signIn(email, password);
    setSubmitting(false);
  };

  const togglePasswordVisibility = () => setShowPassword((prev) => !prev);

  return (
    <AuthLayout
      title="Sign in to PayPilot"
      subtitle="Access your accounts receivable dashboard"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <button
            onClick={() => onSwitch('signup')}
            className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Create one
          </button>
        </>
      }
    >
      <form noValidate className="space-y-4" onSubmit={handleSubmit} aria-label="Sign in">
        {error && <FormAlert>{error}</FormAlert>}

        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-slate-400 mb-2">
            Email address
          </label>
          <div className="relative">
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
              className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        <div>
          <div className="relative">
            <label htmlFor="login-password" className="absolute text-xs font-medium text-slate-400 pointer-events-none select-none top-3 -left-4 text-sm">
              Password
            </label>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              placeholder={showPassword ? '' : '••••••••'}
              className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-300 transition-colors text-sm"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
          {showPassword ? (
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="mt-2 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              aria-label="Hide password"
            >
              Hide
            </button>
          ) : (
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="mt-2 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              aria-label="Show password"
            >
              Show
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors shadow-lg hover:shadow-xl"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
};
