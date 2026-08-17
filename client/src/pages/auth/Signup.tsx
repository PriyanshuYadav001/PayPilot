import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import type { AuthView } from './AuthGate';

interface SignupPageProps {
  onSwitch: (view: AuthView) => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onSwitch }) => {
  const { signUp, error, clearError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    await signUp(email, password, fullName, organizationName);
    setSubmitting(false);
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your organization and start collecting payments"
      footer={
        <>
          Already have an account?{' '}
          <button
            onClick={() => onSwitch('login')}
            className="font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Sign in
          </button>
        </>
      }
    >
      <form noValidate className="space-y-4" onSubmit={handleSubmit} aria-label="Sign up">
        {error && <FormAlert>{error}</FormAlert>}

        <div>
          <label htmlFor="signup-name" className="block text-xs font-medium text-slate-400 mb-1.5">
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              clearError();
            }}
            placeholder="Jane Doe"
            className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="signup-org" className="block text-xs font-medium text-slate-400 mb-1.5">
            Organization name
          </label>
          <input
            id="signup-org"
            type="text"
            autoComplete="organization"
            required
            value={organizationName}
            onChange={(e) => {
              setOrganizationName(e.target.value);
              clearError();
            }}
            placeholder="Acme Corp"
            className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="block text-xs font-medium text-slate-400 mb-1.5">
            Email address
          </label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password" className="block text-xs font-medium text-slate-400 mb-1.5">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            placeholder="At least 8 characters"
            className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
};
