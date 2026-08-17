import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Organization } from '@shared/types';
import { useAuth } from '../hooks/useAuth';

export interface OrganizationContextType {
  currentOrg: Organization | null;
  organizations: Organization[];
  setCurrentOrg: (org: Organization | null) => void;
  setOrganizations: (orgs: Organization[]) => void;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { organizations: authOrganizations } = useAuth();
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Keep organization state in sync with the authenticated user's memberships.
  useEffect(() => {
    setOrganizations(authOrganizations);
    setCurrentOrg((prev) => {
      if (authOrganizations.length === 0) return null;
      return authOrganizations.find((org) => org.id === prev?.id) ?? authOrganizations[0];
    });
  }, [authOrganizations]);

  return (
    <OrganizationContext.Provider
      value={{
        currentOrg,
        organizations,
        setCurrentOrg,
        setOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export function useOrganizationContext(): OrganizationContextType {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganizationContext must be used within an OrganizationProvider');
  }
  return context;
}
