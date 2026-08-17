import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { FullPageLoader } from './FullPageLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * ProtectedRoute
 * Guards content behind authentication.
 * Shows a loading spinner while checking auth, and renders fallback (or nothing)
 * when unauthenticated. The parent App component handles showing the login page.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, fallback }) => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageLoader />;
  }

  if (!session) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
};
