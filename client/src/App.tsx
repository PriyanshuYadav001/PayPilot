/* Quiet Operator: graphite workspace shell, lime state signal, keyboard-first navigation. */
import React from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import Invoices from "@/pages/Invoices";
import Payments from "@/pages/Payments";
import FollowUps from "@/pages/FollowUps";
import Settings from "@/pages/Settings";
import { AuthGate, type AuthView } from './pages/auth/AuthGate';
import CustomerPaymentPage from './pages/customer/PaymentPage';
import { AuthProvider } from './contexts/AuthContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import type { NavigationTab } from './components/Sidebar';
import { useAuth } from './hooks/useAuth';
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Redirect, Route, Switch, useLocation } from "wouter";

function Router() {
  const { session } = useAuth();
  const [path, navigate] = useLocation();
  const activeTab: NavigationTab = path.startsWith('/invoices')
    ? 'invoices'
    : path.startsWith('/customers')
    ? 'customers'
    : path.startsWith('/payments')
    ? 'payments'
    : path.startsWith('/follow-ups')
    ? 'followups'
    : path.startsWith('/settings')
    ? 'settings'
    : 'dashboard';
  const protectedPage = (page: React.ReactNode) => (
    <ProtectedRoute fallback={<Redirect to="/login" />}>
      <Layout activeTab={activeTab} onTabChange={(tab) => navigate(tab === 'followups' ? '/follow-ups' : `/${tab}`)}>
        {page}
      </Layout>
    </ProtectedRoute>
  );
  const authPage = (view: AuthView) => (
    <AuthGate
      view={view}
      onSwitch={(next) => navigate(next === 'forgot' ? '/forgot-password' : next === 'reset' ? '/reset-password' : `/${next}`)}
    />
  );

  return (
    <Switch>
      <Route path="/pay/:token" component={CustomerPaymentPage} />
      <Route path="/login">{() => authPage('login')}</Route>
      <Route path="/signup">{() => authPage('signup')}</Route>
      <Route path="/forgot-password">{() => authPage('forgot')}</Route>
      <Route path="/reset-password">{() => authPage('reset')}</Route>
      <Route path="/dashboard">{() => protectedPage(<Dashboard />)}</Route>
      <Route path="/customers">{() => protectedPage(<Customers />)}</Route>
      <Route path="/invoices">{() => protectedPage(<Invoices />)}</Route>
      <Route path="/payments">{() => protectedPage(<Payments />)}</Route>
      <Route path="/follow-ups">{() => protectedPage(<FollowUps />)}</Route>
      <Route path="/settings">{() => protectedPage(<Settings />)}</Route>
      <Route path="/">{() => session ? <Redirect to="/dashboard" /> : <Home />}</Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" />
          <AuthProvider>
            <OrganizationProvider>
              <Router />
            </OrganizationProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}