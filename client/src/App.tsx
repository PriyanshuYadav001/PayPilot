import React, { useEffect, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { FullPageLoader } from './components/FullPageLoader';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { NavigationTab } from './components/Sidebar';
import { AuthGate, type AuthView } from './pages/auth/AuthGate';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { Customers } from './pages/Customers';
import { FollowUps } from './pages/FollowUps';
import { Settings } from './pages/Settings';

const AppShell: React.FC = () => {
  const { session, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [authView, setAuthView] = useState<AuthView>('login');
  // When set, the auth screen is forced on even if a session exists.
  // Used to keep the password reset flow visible after its tokens are exchanged.
  const [forceAuthView, setForceAuthView] = useState<AuthView | null>(null);

  // If the user landed on a password recovery link, open the reset flow.
  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      setAuthView('reset');
      setForceAuthView('reset');
    }
  }, []);

  const handleAuthSwitch = (view: AuthView) => {
    setAuthView(view);
    setForceAuthView(view === 'reset' ? 'reset' : null);
  };

  if (isLoading) {
    return <FullPageLoader />;
  }

  if (forceAuthView || !session) {
    return <AuthGate view={forceAuthView ?? authView} onSwitch={handleAuthSwitch} />;
  }

  return (
    <ProtectedRoute>
      <Layout activeTab={activeTab} onTabChange={setActiveTab}>
        {renderActiveTab(activeTab)}
      </Layout>
    </ProtectedRoute>
  );
};

function renderActiveTab(activeTab: NavigationTab) {
  switch (activeTab) {
    case 'invoices':
      return <Invoices />;
    case 'customers':
      return <Customers />;
    case 'followups':
      return <FollowUps />;
    case 'settings':
      return <Settings />;
    case 'dashboard':
    default:
      return <Dashboard />;
  }
}

export const App: React.FC = () => (
  <AuthProvider>
    <OrganizationProvider>
      <AppShell />
    </OrganizationProvider>
  </AuthProvider>
);

export default App;
