import React from 'react';
import { Building2, Bell, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../hooks/useOrganization';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { currentOrg } = useOrganization();

  return (
    <header className="h-16 bg-slate-900/60 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-10">
      {/* Organization Selector / Indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-sm font-medium text-slate-200">
          <Building2 className="w-4 h-4 text-emerald-400" />
          <span>{currentOrg?.name || 'Default Organization'}</span>
        </div>
      </div>

      {/* User profile & actions */}
      <div className="flex items-center gap-3">
        <button
          title="Notifications"
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors relative"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full"></span>
        </button>

        <div className="h-5 w-px bg-slate-800" />

        <div className="flex items-center gap-2 text-sm text-slate-300">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <UserIcon className="w-4 h-4" />
          </div>
          <span className="text-xs text-slate-400 hidden sm:inline">{user?.email || 'admin@paypilot.io'}</span>
        </div>

        <button
          onClick={() => signOut()}
          title="Sign Out"
          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
