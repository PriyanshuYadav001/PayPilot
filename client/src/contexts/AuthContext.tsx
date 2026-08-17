import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { apiRequest } from '../lib/apiClient';
import type { Profile, Organization } from '../types';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  organizations: (Organization & { role: string })[];
  isLoading: boolean;
  error: string | null;
  signUp: (email: string, password: string, fullName: string, organizationName: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organizations, setOrganizations] = useState<(Organization & { role: string })[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Fetch user profile and organizations from /auth/me
  const fetchUserData = useCallback(async (accessToken: string) => {
    try {
      const response = await apiRequest<{
        profile: Profile;
        organizations: (Organization & { role: string })[];
      }>('/auth/me', { token: accessToken });

      if (response.success && response.data) {
        setProfile(response.data.profile);
        setOrganizations(response.data.organizations);
      }
    } catch {
      // Silently fail — user data will be fetched on next load
    }
  }, []);

  useEffect(() => {
    // Check initial auth state
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.access_token) {
        fetchUserData(initialSession.access_token).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    }).catch(() => {
      setIsLoading(false);
    });

    // Listen for auth changes (session persistence)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (!newSession) {
        setProfile(null);
        setOrganizations([]);
      } else if (newSession.access_token) {
        fetchUserData(newSession.access_token);
      }

      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const signUp = async (email: string, password: string, fullName: string, organizationName: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await apiRequest<{
        user: { id: string; email: string; fullName: string };
        organization: { id: string; name: string; slug: string };
        session: { access_token: string; refresh_token: string; expires_at: number } | null;
      }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName, organizationName }),
      });

      if (!response.success) {
        setError(response.error?.message || 'Signup failed.');
        return false;
      }

      // If we got a session back, set it in Supabase client for persistence
      if (response.data?.session) {
        await supabase.auth.setSession({
          access_token: response.data.session.access_token,
          refresh_token: response.data.session.refresh_token,
        });
        // Populate profile and organizations immediately (onAuthStateChange also fires)
        await fetchUserData(response.data.session.access_token);
      }

      return true;
    } catch {
      setError('An unexpected error occurred during signup.');
      return false;
    }
  };

  const signIn = async (email: string, password: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await apiRequest<{
        user: Record<string, unknown>;
        session: { access_token: string; refresh_token: string; expires_at: number };
        organizations: (Organization & { role: string })[];
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (!response.success) {
        setError(response.error?.message || 'Login failed.');
        return false;
      }

      if (response.data?.session) {
        // Set session in Supabase client for persistence & onAuthStateChange
        await supabase.auth.setSession({
          access_token: response.data.session.access_token,
          refresh_token: response.data.session.refresh_token,
        });
      }

      if (response.data?.organizations) {
        setOrganizations(response.data.organizations);
      }

      return true;
    } catch {
      setError('An unexpected error occurred during login.');
      return false;
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Client-side signout is sufficient
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setOrganizations([]);
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      if (!response.success) {
        setError(response.error?.message || 'Failed to send reset email.');
        return false;
      }

      return true;
    } catch {
      setError('An unexpected error occurred.');
      return false;
    }
  };

  const updatePassword = async (password: string): Promise<boolean> => {
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return false;
      }
      return true;
    } catch {
      setError('Failed to update your password.');
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        organizations,
        isLoading,
        error,
        signUp,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
