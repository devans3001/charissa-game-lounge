import React, { useState } from 'react';
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
  User,
  KeyRound,
  Coins,
  Landmark
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'newsale'
  | 'transactions'
  | 'reconciliation'
  | 'games'
  | 'cashiers'
  | 'coinvault'
  | 'bank_accounts'
  | 'correction_requests'
  | 'audit';

interface NavigationProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  children: React.ReactNode;
}

export function Navigation({ activeTab, onSelectTab, children }: NavigationProps) {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  const navItems = isAdmin
    ? [
        { id: 'dashboard' as ActiveTab, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'newsale' as ActiveTab, label: 'New Sale (POS)', icon: PlusCircle },
        { id: 'transactions' as ActiveTab, label: 'All Transactions', icon: Receipt },
        { id: 'reconciliation' as ActiveTab, label: 'Daily Reconciliation', icon: Scale },
        { id: 'coinvault' as ActiveTab, label: 'Coin Vault', icon: Coins },
        { id: 'bank_accounts' as ActiveTab, label: 'Transfer Accounts', icon: Landmark },
        { id: 'games' as ActiveTab, label: 'Games & Pricing', icon: Gamepad2 },
        { id: 'cashiers' as ActiveTab, label: 'Cashier Accounts', icon: Users },
        { id: 'correction_requests' as ActiveTab, label: 'Fix Requests', icon: FileQuestion },
        { id: 'audit' as ActiveTab, label: 'Audit Trail', icon: ShieldCheck },
      ]
    : [
        { id: 'newsale' as ActiveTab, label: 'New Sale (POS)', icon: PlusCircle },
        { id: 'coinvault' as ActiveTab, label: 'My Coin Float', icon: Coins },
        { id: 'transactions' as ActiveTab, label: 'My Transactions', icon: Receipt },
        { id: 'dashboard' as ActiveTab, label: 'My Shift Overview', icon: LayoutDashboard },
        { id: 'correction_requests' as ActiveTab, label: 'My Fix Requests', icon: FileQuestion },
      ];

  const handleNavClick = (tab: ActiveTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Mandatory Change Password prompt if user has default temporary password */}
      {user?.mustChangePassword && (
        <ChangePasswordModal isOpen={true} isMandatory={true} />
      )}

      {/* Voluntary Change Password Modal */}
      {showPasswordModal && (
        <ChangePasswordModal
          isOpen={true}
          isMandatory={false}
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {/* Top Bar Contract (1 line, 3 zones) */}
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

        {/* Zone 2: Navigation Links for fast desktop switching */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-400">
          <button
            type="button"
            onClick={() => handleNavClick('newsale')}
            className={`transition whitespace-nowrap cursor-pointer hover:text-white ${
              activeTab === 'newsale' ? 'text-indigo-400 border-b-2 border-indigo-500 py-4' : ''
            }`}
          >
            Terminal POS
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className={`transition whitespace-nowrap cursor-pointer hover:text-white ${
              activeTab === 'dashboard' ? 'text-indigo-400 border-b-2 border-indigo-500 py-4' : ''
            }`}
          >
            Financial Dashboard
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => handleNavClick('reconciliation')}
              className={`transition whitespace-nowrap cursor-pointer hover:text-white ${
                activeTab === 'reconciliation' ? 'text-indigo-400 border-b-2 border-indigo-500 py-4' : ''
              }`}
            >
              Daily Reconciliation
            </button>
          )}
          <button
            type="button"
            onClick={() => handleNavClick('transactions')}
            className={`transition whitespace-nowrap cursor-pointer hover:text-white ${
              activeTab === 'transactions' ? 'text-indigo-400 border-b-2 border-indigo-500 py-4' : ''
            }`}
          >
            Sales Ledger
          </button>
        </nav>

        {/* Zone 3: Single Primary Action / Account profile */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-white whitespace-nowrap">{user?.name}</span>
            <span className="text-[10px] text-slate-400 font-mono uppercase">{user?.role}</span>
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
            onClick={logout}
            title="Sign out of shift"
            className="p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-rose-400 hover:border-rose-900/50 hover:bg-slate-900 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout Body: Sidebar + Viewport */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar (260px) */}
        <aside className="w-64 border-r border-slate-800/80 bg-slate-900/50 hidden md:flex flex-col justify-between p-4 shrink-0 no-print">
          <div className="space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {isAdmin ? 'Management Console' : 'Cashier Counter'}
            </div>

            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[42px] ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1 font-mono">
            <div className="text-slate-300 font-semibold">Africa/Lagos Timezone</div>
            <div>NGN Currency (₦)</div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
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
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition min-h-[46px] ${
                      isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
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
                onClick={logout}
                className="w-full py-3 rounded-xl bg-slate-900 border border-slate-800 text-rose-400 text-sm font-semibold flex items-center justify-center gap-2 min-h-[46px]"
              >
                <LogOut className="w-4 h-4" />
                Sign Out ({user?.username})
              </button>
            </div>
          </div>
        )}

        {/* Main Viewport Content */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (Pattern 1 thumb ergonomics) */}
      <nav
        aria-label="Mobile quick navigation"
        className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 md:hidden flex items-center justify-around px-2 py-1.5 no-print"
      >
        <button
          type="button"
          onClick={() => handleNavClick('newsale')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] font-semibold transition min-w-[56px] min-h-[48px] ${
            activeTab === 'newsale' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PlusCircle className="w-5 h-5 mb-0.5" />
          <span>POS</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavClick('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] font-semibold transition min-w-[56px] min-h-[48px] ${
            activeTab === 'dashboard' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavClick('transactions')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] font-semibold transition min-w-[56px] min-h-[48px] ${
            activeTab === 'transactions' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt className="w-5 h-5 mb-0.5" />
          <span>Ledger</span>
        </button>

        {isAdmin ? (
          <button
            type="button"
            onClick={() => handleNavClick('reconciliation')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] font-semibold transition min-w-[56px] min-h-[48px] ${
              activeTab === 'reconciliation' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="w-5 h-5 mb-0.5" />
            <span>Reconcile</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleNavClick('coinvault')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] font-semibold transition min-w-[56px] min-h-[48px] ${
              activeTab === 'coinvault' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-5 h-5 mb-0.5" />
            <span>Float</span>
          </button>
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
