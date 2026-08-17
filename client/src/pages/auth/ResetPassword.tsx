import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import type { AuthView } from './AuthGate';

interface ResetPasswordPageProps {
  onSwitch: (view: AuthView) => void;
}

type SessionSetup =
  | { status: 'resolving' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onSwitch }) => {
  const { updatePassword, error, clearError } = useAuth();
  const [setup, setSetup] = useState<SessionSetup>({ status: 'resolving' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Exchange the recovery link tokens for an active session, then allow a new password.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const type = params.get('type');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresAt = params.get('expires_at');
    const code = params.get('code');

    const establish = async () => {
      try {
        if (type === 'recovery' && accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
            ...(expiresAt ? { expires_at: Number(expiresAt) } : {}),
          });
          if (sessionError) {
            setSetup({ status: 'error', message: sessionError.message });
            return;
          }
        } else if (code) {
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeError) {
            setSetup({ status: 'error', message: codeError.message });
            return;
          }
        } else {
          setSetup({ status: 'error', message: 'Invalid or expired reset link. Please request a new one.' });
          return;
        }
        setSetup({ status: 'ready' });
      } catch {
        setSetup({ status: 'error', message: 'Unable to validate your reset link. Please try again.' });
      }
    };

    void establish();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFieldError('Passwords do not match.');
      return;
    }

    setFieldError(null);
    setSubmitting(true);
    const ok = await updatePassword(password);
    setSubmitting(false);

    if (ok) {
      setCompleted(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  if (setup.status === 'resolving') {
    return (
      <AuthLayout title="Reset your password" subtitle="Validating your reset link...">
        <div className="text-sm text-slate-400">Please wait a moment.</div>
      </AuthLayout>
    );
  }

  if (setup.status === 'error') {
    return (
      <AuthLayout title="Reset your password" subtitle="We could not process this link" footer={
        <button
          onClick={() => onSwitch('forgot')}
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Request a new link
        </button>
      }>
        <FormAlert>{setup.message}</FormAlert>
      </AuthLayout>
    );
  }

  if (completed) {
    return (
      <AuthLayout title="Password updated" subtitle="Your password has been changed successfully" footer={
        <button
          onClick={() => onSwitch('login')}
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Back to sign in
        </button>
      }>
        <button
          onClick={() => onSwitch('login')}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          Continue to sign in
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a strong password for your account"
      footer={
        <button
          onClick={() => onSwitch('login')}
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          Back to sign in
        </button>
      }
    >
      <form noValidate className="space-y-4" onSubmit={handleSubmit} aria-label="Reset password">
        {(error || fieldError) && <FormAlert>{fieldError ?? error}</FormAlert>}

        <div>
          <label htmlFor="reset-password" className="block text-xs font-medium text-slate-400 mb-1.5">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldError(null);
              clearError();
            }}
            placeholder="At least 8 characters"
            className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="reset-confirm" className="block text-xs font-medium text-slate-400 mb-1.5">
            Confirm new password
          </label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setFieldError(null);
              clearError();
            }}
            placeholder="Re-enter your password"
            className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          {submitting ? 'Updating password...' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  );
};
