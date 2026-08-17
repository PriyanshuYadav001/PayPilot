import React from 'react';
import { LoginPage } from './Login';
import { SignupPage } from './Signup';
import { ForgotPasswordPage } from './ForgotPassword';
import { ResetPasswordPage } from './ResetPassword';

export type AuthView = 'login' | 'signup' | 'forgot' | 'reset';

interface AuthGateProps {
  view: AuthView;
  onSwitch: (view: AuthView) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ view, onSwitch }) => {
  switch (view) {
    case 'signup':
      return <SignupPage onSwitch={onSwitch} />;
    case 'forgot':
      return <ForgotPasswordPage onSwitch={onSwitch} />;
    case 'reset':
      return <ResetPasswordPage onSwitch={onSwitch} />;
    case 'login':
    default:
      return <LoginPage onSwitch={onSwitch} />;
  }
};
