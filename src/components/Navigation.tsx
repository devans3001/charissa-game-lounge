import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext.tsx';
import { ChangePasswordModal } from './ChangePasswordModal.tsx';
import {
  Gamepad2,
  LayoutDashboard,
  Receipt,
  Scale,
  Users,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  PlusCircle,
  FileQuestion,
  KeyRound,
  Coins,
  Landmark,
  BookmarkCheck
} from 'lucide-react';

// Route paths map to your URL segments
export type NavPath =
  | '/'
  | '/newsale'
  | '/tabs'
  | '/transactions'
  | '/reconciliation'
  | '/games'
  | '/cashiers'
  | '/coinvault'
  | '/bank_accounts'
  | '/correction_requests'
  | '/audit';

interface NavItem {
  to: NavPath;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function Navigation() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const role = user?.role;
  const isAdmin = role === 'ADMIN';

  let navItems: NavItem[] = [];
  if (role === 'ADMIN') {
    navItems = [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/newsale', label: 'New Sale (POS)', icon: PlusCircle },
      { to: '/tabs', label: 'Saved Tabs (Open)', icon: BookmarkCheck },
      { to: '/transactions', label: 'All Transactions', icon: Receipt },
      { to: '/reconciliation', label: 'Daily Reconciliation', icon: Scale },
      { to: '/coinvault', label: 'Coin Vault', icon: Coins },
      { to: '/bank_accounts', label: 'Transfer Accounts', icon: Landmark },
      { to: '/games', label: 'Games & Pricing', icon: Gamepad2 },
      { to: '/cashiers', label: 'Staff & Accounts', icon: Users },
      { to: '/correction_requests', label: 'Fix Requests', icon: FileQuestion },
      { to: '/audit', label: 'Audit Trail', icon: ShieldCheck },
    ];
  } else if (role === 'DEVELOPER') {
    navItems = [
      { to: '/games', label: 'Games & Pricing', icon: Gamepad2 },
      { to: '/coinvault', label: 'Coin Vault', icon: Coins },
      { to: '/cashiers', label: 'Staff & Accounts', icon: Users },
      { to: '/correction_requests', label: 'Fix Requests', icon: FileQuestion },
      { to: '/audit', label: 'Audit Trail', icon: ShieldCheck },
      { to: '/transactions', label: 'All Transactions', icon: Receipt },
      { to: '/', label: 'System Overview', icon: LayoutDashboard },
      { to: '/newsale', label: 'POS Terminal (Test)', icon: PlusCircle },
      { to: '/tabs', label: 'Saved Tabs', icon: BookmarkCheck },
    ];
  } else if (role === 'ACCOUNTANT') {
    navItems = [
      { to: '/', label: 'Financial Overview', icon: LayoutDashboard },
      { to: '/reconciliation', label: 'Daily Reconciliation', icon: Scale },
      { to: '/transactions', label: 'All Transactions', icon: Receipt },
      { to: '/coinvault', label: 'Coin Vault & Float', icon: Coins },
      { to: '/bank_accounts', label: 'Transfer Accounts', icon: Landmark },
    ];
  } else {
    // CASHIER
    navItems = [
      { to: '/newsale', label: 'New Sale (POS)', icon: PlusCircle },
      { to: '/tabs', label: 'Saved Tabs', icon: BookmarkCheck },
      { to: '/coinvault', label: 'My Coin Float', icon: Coins },
      { to: '/transactions', label: 'My Transactions', icon: Receipt },
      { to: '/', label: 'My Shift Overview', icon: LayoutDashboard },
      { to: '/correction_requests', label: 'My Fix Requests', icon: FileQuestion },
    ];
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Shared class helper for NavLink active state
  const desktopNavClass = ({ isActive }: { isActive: boolean }) =>
    `transition whitespace-nowrap cursor-pointer hover:text-white ${
      isActive ? 'text-indigo-400 border-b-2 border-indigo-500 py-4' : ''
    }`;

  const sidebarItemClass = ({ isActive }: { isActive: boolean }) =>
    `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[42px] ${
      isActive
        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
    }`;

  const mobileDrawerItemClass = ({ isActive }: { isActive: boolean }) =>
    `w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition min-h-[46px] ${
      isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950' : 'text-slate-300 hover:bg-slate-800'
    }`;

  const bottomBarItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] font-semibold transition min-w-[56px] min-h-[48px] ${
      isActive ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {user?.mustChangePassword && (
        <ChangePasswordModal isOpen={true} isMandatory={true} />
      )}

      {showPasswordModal && (
        <ChangePasswordModal
          isOpen={true}
          isMandatory={false}
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {/* Top Bar */}
      <header className="h-16 border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between gap-8 sticky top-0 z-40 no-print">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <span className="font-bold text-white tracking-tight text-base whitespace-nowrap">
            Game Lounge System
          </span>
        </div>

        {/* Zone 2: Desktop quick nav */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-400">
          <NavLink to="/newsale" className={desktopNavClass}>
            Terminal POS
          </NavLink>
          <NavLink to="/" end className={desktopNavClass}>
            Financial Dashboard
          </NavLink>
          {isAdmin && (
            <NavLink to="/reconciliation" className={desktopNavClass}>
              Daily Reconciliation
            </NavLink>
          )}
          <NavLink to="/transactions" className={desktopNavClass}>
            Sales Ledger
          </NavLink>
        </nav>

        {/* Zone 3: Account */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-white whitespace-nowrap">{user?.name}</span>
            <span
              className={`text-[9px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full inline-block self-end mt-0.5 ${
                role === 'ADMIN'
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : role === 'DEVELOPER'
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                  : role === 'ACCOUNTANT'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
              }`}
            >
              {user?.role}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            title="Change your account password"
            className="p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-indigo-400 hover:border-indigo-800/60 hover:bg-slate-900 transition cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign out of shift"
            className="p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-rose-400 hover:border-rose-900/50 hover:bg-slate-900 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Body: Sidebar + Viewport (no overflow-hidden, so sticky works) */}
      <div className="flex-1 flex">
        {/* Desktop Sidebar — sticky under the 64px header */}
        <aside className="w-64 border-r border-slate-800/80 bg-slate-900/50 hidden md:flex flex-col justify-between p-4 shrink-0 no-print sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto self-start">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {role === 'ADMIN'
                ? 'Super Admin Console'
                : role === 'DEVELOPER'
                ? 'Developer Console'
                : role === 'ACCOUNTANT'
                ? 'Financial Portal'
                : 'Cashier Counter'}
            </div>

            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={sidebarItemClass}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1 font-mono">
            <div className="text-slate-300 font-semibold">Africa/Lagos Timezone</div>
            <div>NGN Currency (₦)</div>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm md:hidden flex flex-col p-4 no-print animate-in fade-in duration-150">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <span className="font-bold text-white text-base">Game Lounge Menu</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                All Navigation Destinations
              </div>
              {navItems.map(item => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={mobileDrawerItemClass}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => { setShowPasswordModal(true); setMobileMenuOpen(false); }}
                className="w-full py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 min-h-[46px]"
              >
                <KeyRound className="w-4 h-4 text-indigo-400" />
                Change Password
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-3 rounded-xl bg-slate-900 border border-slate-800 text-rose-400 text-sm font-semibold flex items-center justify-center gap-2 min-h-[46px]"
              >
                <LogOut className="w-4 h-4" />
                Sign Out ({user?.username})
              </button>
            </div>
          </div>
        )}

        {/* Main Content — page scrolls; Outlet renders the matched child route */}
        <main className="flex-1 min-w-0 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav
        aria-label="Mobile quick navigation"
        className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 md:hidden flex items-center justify-around px-2 py-1.5 no-print"
      >
        <NavLink to="/newsale" className={bottomBarItemClass}>
          <PlusCircle className="w-5 h-5 mb-0.5" />
          <span>POS</span>
        </NavLink>

        <NavLink to="/" end className={bottomBarItemClass}>
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/transactions" className={bottomBarItemClass}>
          <Receipt className="w-5 h-5 mb-0.5" />
          <span>Ledger</span>
        </NavLink>

        {isAdmin ? (
          <NavLink to="/reconciliation" className={bottomBarItemClass}>
            <Scale className="w-5 h-5 mb-0.5" />
            <span>Reconcile</span>
          </NavLink>
        ) : (
          <NavLink to="/coinvault" className={bottomBarItemClass}>
            <Coins className="w-5 h-5 mb-0.5" />
            <span>Float</span>
          </NavLink>
        )}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition min-w-[56px] min-h-[48px]"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}