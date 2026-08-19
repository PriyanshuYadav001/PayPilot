import React, { ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import type { AuthView } from './AuthGate';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  onSwitch?: (view: AuthView) => void;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer, onSwitch }) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      <div className="flex lg:flex-row lg:flex-col lg:items-start lg:justify-between relative z-10">
        {/* Sidebar for larger screens */}
        <div className="lg:w-24 lg:h-full lg:bg-slate-900/80 lg:border-l lg:border-slate-700 lg:p-6 lg:transition-colors lg:hover:bg-slate-950/50 max-w-24">
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:absolute lg:top-4 lg:left-4 lg:hidden p-2 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close sidebar"
          >
            <XIcon className="w-5 h-5 text-slate-400" />
          </button>
          <div className="space-y-4 pt-8">
            <button
              onClick={() => onSwitch?.('login')}
              className="w-full flex items-center justify-center py-3 px-3 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              data-view="login"
            >
              <span className="w-3 h-3 rounded-full bg-emerald-600 mr-3"></span>
              Login
            </button>
            <button
              onClick={() => onSwitch?.('signup')}
              className="w-full flex items-center justify-center py-3 px-3 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              data-view="signup"
            >
              <span className="w-3 h-3 rounded-full bg-slate-600 mr-3"></span>
              Sign Up
            </button>
          </div>
        </div>

        <main className="w-full lg:w-[calc(100%-24)] lg:pl-6 transition-all">
          <div className="flex items-center justify-between mb-6 px-6 lg:px-0">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/30">
                P
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-slate-100">PayPilot</span>
                <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 align-middle">
                  B2B AR Automation
                </span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Open sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2h-2m2 4H5m2-4l-2 2h2l-2-2h2l-2 2h2l-2-2h2l-2 2h2" />
              </svg>
            </button>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-8 shadow-xl backdrop-blur-sm flex flex-col lg:flex-row gap-6">
            <h1 className="text-xl font-bold text-slate-100 flex-1 lg:flex-none">{title}</h1>
            <p className="text-sm text-slate-400 mt-1 lg:mt-0 lg:mb-0">{subtitle}</p>
          </div>

          <div className="mt-6 lg:mt-0 flex-1 lg:flex">
            <div className="order-1 lg:order-2">{children}</div>
            <div className="order-2 lg:order-1 w-1/2 bg-slate-800/50 backdrop-blur rounded-lg p-6 hidden lg:block">
              {/* Secondary content area */}
            </div>
          </div>
        </main>

        {sidebarOpen && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-zxl z-50 flex items-center justify-center">
            <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 w-80 max-w-full space-y-4">
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Close sidebar"
              >
                <XIcon className="w-5 h-5 text-slate-400" />
              </button>
              <nav className="space-y-3">
                <button
                  onClick={() => {
                    setSidebarOpen(false);
                    onSwitch?.('login');
                  }}
                  className="w-full flex items-center justify-center py-2 px-3 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                >
                  <span className="w-3 h-3 rounded-full bg-emerald-600 mr-3"></span>
                  Login
                </button>
                <button
                  onClick={() => {
                    setSidebarOpen(false);
                    onSwitch?.('signup');
                  }}
                  className="w-full flex items-center justify-center py-2 px-3 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                >
                  <span className="w-3 h-3 rounded-full bg-slate-600 mr-3"></span>
                  Sign Up
                </button>
              </nav>
            </div>
          </div>
        )}
        {footer && <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>}
      </div>
    </div>
  );
};
