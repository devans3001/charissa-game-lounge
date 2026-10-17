import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { User, UserRole } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { queryClient, queryKeys } from '../lib/queryClient.ts';
import { formatNaira, formatLagosDateTime, validateAndNormalizeNigerianPhone } from '../lib/utils.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Users,
  UserPlus,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  CheckCircle2,
  X,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Code2,
  Landmark,
  Gamepad2,
  Phone,
  Lock,
  Sparkles,
  Check
} from 'lucide-react';
import { GameCardSkeleton, GameDataLoadingOverlay, GameInlineLoader } from './game-ui/index.ts';

export interface StaffUserWithStats extends User {
  totalTransactions: number;
  totalSalesKobo: number;
  todayTransactions: number;
  todaySalesKobo: number;
}

const ROLE_CONFIG: Record<
  UserRole,
  {
    label: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    allowedPages: string;
  }
> = {
  ADMIN: {
    label: 'Administrator',
    badgeBg: 'bg-purple-500/15',
    badgeBorder: 'border-purple-500/30',
    badgeText: 'text-purple-300',
    icon: ShieldCheck,
    description: 'Full administrative authority across all modules, games, pricing, users & reconciliation.',
    allowedPages: 'All pages (Dashboard, POS, Tabs, Ledger, Reconciliation, Vault, Accounts, Games, Staff, Audits)',
  },
  DEVELOPER: {
    label: 'Developer',
    badgeBg: 'bg-amber-500/15',
    badgeBorder: 'border-amber-500/30',
    badgeText: 'text-amber-300',
    icon: Code2,
    description: 'Technical oversight, games & pricing rules, coin vault monitoring, fix requests, and audit trail.',
    allowedPages: 'Games & Pricing, Coin Vault, Staff & Accounts, Fix Requests, Audit Trail, Ledger, Test POS',
  },
  ACCOUNTANT: {
    label: 'Accountant',
    badgeBg: 'bg-emerald-500/15',
    badgeBorder: 'border-emerald-500/30',
    badgeText: 'text-emerald-300',
    icon: Landmark,
    description: 'Financial oversight only. Audits daily reconciliation, cash drawers, transfers, and coin floats.',
    allowedPages: 'Financial Overview, Daily Reconciliation, All Transactions, Coin Vault & Float, Transfer Accounts',
  },
  CASHIER: {
    label: 'Cashier Staff',
    badgeBg: 'bg-indigo-500/15',
    badgeBorder: 'border-indigo-500/30',
    badgeText: 'text-indigo-300',
    icon: Gamepad2,
    description: 'Front-desk point-of-sale register, customer tabs, station management, and daily cash drawer float.',
    allowedPages: 'POS Register, Saved Tabs, My Coin Float, My Transactions, Shift Overview, Correction Requests',
  },
};

export function CashierManagementView() {
  const { user: currentUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Role hierarchy: only DEVELOPER can create/manage non-CASHIER accounts.
  const isDeveloper = currentUser?.role === 'DEVELOPER';
  const viewerRole = currentUser?.role;

  // Tab filter by role
  const [activeRoleFilter, setActiveRoleFilter] = useState<'ALL' | UserRole>('ALL');

  // Add staff modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('CASHIER');
  const [creating, setCreating] = useState(false);

  // Reset password modal
  const [resetModalUser, setResetModalUser] = useState<StaffUserWithStats | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [resetting, setResetting] = useState(false);

  // Live phone validation
  const phoneValidation = validateAndNormalizeNigerianPhone(newPhone);
  const isPhoneValid = phoneValidation.isValid;

  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.users(),
    queryFn: async () => {
      const res = await api.users.list();
      return res.users as StaffUserWithStats[];
    },
    refetchInterval: 15_000,
  });

  const staffList = data || [];

  useEffect(() => {
    if (queryError) setError((queryError as any).message || 'Failed to load staff accounts');
  }, [queryError]);

  const toggleMutation = useMutation({
    mutationFn: (vars: { userId: string; makeActive: boolean }) =>
      api.users.toggleStatus(vars.userId, vars.makeActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['cashiers'] });
      queryClient.invalidateQueries({ queryKey: ['coinBalances'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to update user status'),
  });

  const handleToggleStatus = async (staff: StaffUserWithStats) => {
    setError(null);
    if (staff.id === currentUser?.id) {
      setError('You cannot deactivate your own account.');
      return;
    }
    if (staff.id === 'usr_admin_master') {
      setError('The master administrator account cannot be deactivated.');
      return;
    }

    try {
      await toggleMutation.mutateAsync({ userId: staff.id, makeActive: !staff.isActive });
      setSuccessMessage(
        `Account "${staff.name}" (${ROLE_CONFIG[staff.role].label}) has been ${!staff.isActive ? 'activated' : 'deactivated'}.`
      );
    } catch {
      // surfaced through onError
    }
  };

  const createMutation = useMutation({
    mutationFn: (vars: { name: string; phoneNumber: string; role: UserRole }) =>
      api.users.create(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['cashiers'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to create staff account'),
  });

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newName.trim()) {
      setError('Please provide the staff member full name.');
      return;
    }

    if (!phoneValidation.isValid || !phoneValidation.normalized) {
      setError(phoneValidation.error || 'Please enter a valid Nigerian mobile phone number.');
      return;
    }

    try {
      setCreating(true);
      // Non-developer viewers (e.g. ADMIN) may only provision CASHIER accounts.
      const roleToCreate = isDeveloper ? newRole : 'CASHIER';
      const res = await createMutation.mutateAsync({
        name: newName.trim(),
        phoneNumber: phoneValidation.normalized,
        role: roleToCreate,
      });

      setSuccessMessage(
        `${ROLE_CONFIG[roleToCreate].label} account created for "${newName.trim()}"! Initial default password is "${phoneValidation.normalized}". The user will be required to choose a new password upon first login.`
      );
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      setNewRole('CASHIER');
    } catch {
      // surfaced through onError
    } finally {
      setCreating(false);
    }
  };

  const resetPasswordMutation = useMutation({
    mutationFn: (vars: { userId: string; password?: string }) =>
      api.users.resetPassword(vars.userId, vars.password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['cashiers'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to reset password'),
  });

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;

    try {
      setResetting(true);
      setError(null);
      await resetPasswordMutation.mutateAsync({
        userId: resetModalUser.id,
        password: resetPasswordVal.trim() || undefined,
      });

      const resetTarget = resetPasswordVal.trim() || resetModalUser.phoneNumber || 'their phone number';
      setSuccessMessage(
        `Password for "${resetModalUser.name}" successfully reset to ${resetTarget}. User will be prompted to change password on login.`
      );
      setResetModalUser(null);
      setResetPasswordVal('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  // Staff list — ADMIN only sees CASHIER accounts; DEVELOPER sees all roles
  const displayStaff = isDeveloper ? staffList : staffList.filter(s => s.role === 'CASHIER');

  // Filtered staff
  const filteredStaff = displayStaff.filter(s => {
    if (activeRoleFilter === 'ALL') return true;
    return s.role === activeRoleFilter;
  });

  const countByRole = {
    ALL: displayStaff.length,
    CASHIER: displayStaff.filter(s => s.role === 'CASHIER').length,
    ...(isDeveloper && {
      ACCOUNTANT: staffList.filter(s => s.role === 'ACCOUNTANT').length,
      ADMIN: staffList.filter(s => s.role === 'ADMIN').length,
      DEVELOPER: staffList.filter(s => s.role === 'DEVELOPER').length,
    }),
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            {isDeveloper ? 'Staff & System Accounts' : 'Cashier Management'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isDeveloper
              ? 'Create and manage Cashiers, Administrators, Accountants, and Developers · Nigerian Phone Verification · Role Access Control'
              : 'Create and manage Cashier accounts · Nigerian Phone Verification'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowAddModal(true);
            setNewName('');
            setNewPhone('');
            setNewRole('CASHIER');
            setError(null);
          }}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          {isDeveloper ? 'Create New Staff Account' : 'Create New Cashier Account'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl flex items-center justify-between gap-3 text-rose-200 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center justify-between gap-3 text-emerald-200 text-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Role Overview Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {((isDeveloper ? ['CASHIER', 'ACCOUNTANT', 'ADMIN', 'DEVELOPER'] : ['CASHIER']) as UserRole[]).map(r => {
          const cfg = ROLE_CONFIG[r];
          const Icon = cfg.icon;
          const count = countByRole[r];
          const isSelected = activeRoleFilter === r;

          return (
            <button
              key={r}
              type="button"
              onClick={() => setActiveRoleFilter(isSelected ? 'ALL' : r)}
              className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-850 border-indigo-500 ring-1 ring-indigo-500'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded border flex items-center gap-1.5 ${cfg.badgeBg} ${cfg.badgeBorder} ${cfg.badgeText}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  {count} {count === 1 ? 'user' : 'users'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                {cfg.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
          {(isDeveloper
            ? (['ALL', 'CASHIER', 'ACCOUNTANT', 'ADMIN', 'DEVELOPER'] as const)
            : (['ALL', 'CASHIER'] as const)).map(tab => {
            const count = countByRole[tab as UserRole];
            const isTabActive = activeRoleFilter === tab;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveRoleFilter(tab as 'ALL' | UserRole)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isTabActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab === 'ALL' ? 'All Roles' : ROLE_CONFIG[tab as UserRole].label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isTabActive ? 'bg-indigo-900/60 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing {filteredStaff.length} of {displayStaff.length} {isDeveloper ? 'staff accounts' : 'cashier accounts'}
        </div>
      </div>

      {/* Staff Grid */}
      {loading && staffList.length === 0 ? (
        <GameCardSkeleton count={4} columns="grid-cols-1 md:grid-cols-2 lg:grid-cols-3" />
      ) : filteredStaff.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/50 border border-slate-800 rounded-2xl">
          <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-300">No {isDeveloper ? 'staff members' : 'cashiers'} in this role</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Click "{isDeveloper ? 'Create New Staff Account' : 'Create New Cashier Account'}" above to add an account with Nigerian phone validation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map(s => {
            const cfg = ROLE_CONFIG[s.role] || ROLE_CONFIG.CASHIER;
            const RoleIcon = cfg.icon;
            const isSelf = s.id === currentUser?.id;
            const isMaster = s.id === 'usr_admin_master';

            return (
              <div
                key={s.id}
                className={`p-5 rounded-2xl border transition flex flex-col justify-between ${
                  s.isActive
                    ? 'bg-slate-900 border-slate-800 shadow-sm'
                    : 'bg-slate-950/80 border-slate-800/60 opacity-60'
                }`}
              >
                <div>
                  {/* Card Header: Avatar + Role */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm border ${cfg.badgeBg} ${cfg.badgeBorder} ${cfg.badgeText}`}>
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-sm">{s.name}</h3>
                          {isSelf && (
                            <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-500/30">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          @{s.username}
                        </div>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${cfg.badgeBg} ${cfg.badgeBorder} ${cfg.badgeText}`}>
                      <RoleIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Phone & Credentials Info */}
                  <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 my-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        Nigerian Mobile:
                      </span>
                      <span className="font-mono text-slate-200 font-semibold">
                        🇳🇬 {s.phoneNumber || 'None registered'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        Password Status:
                      </span>
                      {s.mustChangePassword ? (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                          ⚠️ Change Required
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                          <Check className="w-3 h-3" /> Set & Active
                        </span>
                      )}
                    </div>

                    {/* For Cashiers: show Shift Sales stats */}
                    {s.role === 'CASHIER' ? (
                      <div className="border-t border-slate-800/80 pt-2 space-y-1.5">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400">Today's Sales:</span>
                          <span className="font-mono font-bold text-emerald-400">
                            {formatNaira(s.todaySalesKobo)} ({s.todayTransactions} sales)
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400">Lifetime Ledger:</span>
                          <span className="font-mono text-slate-300">
                            {formatNaira(s.totalSalesKobo)} ({s.totalTransactions} total)
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-slate-800/80 pt-2">
                        <span className="text-[10px] text-slate-400 block mb-0.5 font-medium">Access Scope:</span>
                        <p className="text-[10px] text-slate-300 leading-tight">
                          {cfg.allowedPages}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 mb-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {s.lastLoginAt ? `Login: ${formatLagosDateTime(s.lastLoginAt)}` : 'Never logged in'}
                    </span>
                    <span className={`text-[10px] font-semibold ${s.isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {s.isActive ? '● Active' : '○ Suspended'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isSelf || isMaster || (!isDeveloper && viewerRole === 'ADMIN' && s.role !== 'CASHIER')}
                    onClick={() => handleToggleStatus(s)}
                    title={!isDeveloper && viewerRole === 'ADMIN' && s.role !== 'CASHIER'
                      ? 'Admins may only activate/deactivate Cashier accounts.'
                      : isSelf ? 'Cannot deactivate yourself' : isMaster ? 'Master admin cannot be deactivated' : ''}
                    className={`text-xs font-semibold flex items-center gap-1.5 transition ${
                      (isSelf || isMaster || (!isDeveloper && viewerRole === 'ADMIN' && s.role !== 'CASHIER'))
                        ? 'text-slate-600 cursor-not-allowed'
                        : s.isActive
                        ? 'text-slate-400 hover:text-rose-400 cursor-pointer'
                        : 'text-emerald-400 hover:text-emerald-300 cursor-pointer'
                    }`}
                  >
                    {s.isActive ? (
                      <>
                        <ToggleRight className="w-4 h-4 text-emerald-400" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-4 h-4 text-slate-500" />
                        Activate
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isSelf || isMaster || (!isDeveloper && viewerRole === 'ADMIN' && s.role !== 'CASHIER')}
                    onClick={() => {
                      setResetModalUser(s);
                      setResetPasswordVal(s.phoneNumber || '');
                    }}
                    title={!isDeveloper && viewerRole === 'ADMIN' && s.role !== 'CASHIER' ? 'Admins may only reset Cashier passwords.' : ''}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      (isSelf || isMaster || (!isDeveloper && viewerRole === 'ADMIN' && s.role !== 'CASHIER'))
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                    Reset Password
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* CREATE STAFF MODAL (WITH NIGERIAN PHONE NUMBER VALIDATION) */}
      {/* ======================================================== */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-slate-100 shadow-2xl relative my-8"
          >
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Provision New Staff Account</h3>
                <p className="text-xs text-slate-400">
                  {isDeveloper ? 'Create Cashiers, Admins, Accountants, or Developers with verified Nigerian credentials' : 'Admins may only create CASHIER accounts. Role selector is hidden — server enforces CASHIER-only creation.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4 mt-5">
              {/* Account Role Selector */}
              {!isDeveloper ? (
                <div className="p-3 bg-indigo-900/30 border border-indigo-500/30 rounded-xl text-center">
                  <span className="text-xs font-semibold text-indigo-300 flex items-center justify-center gap-1.5">
                    <Lock className="w-3 h-3" />
                    You may only create <strong className="text-indigo-200">CASHIER</strong> accounts.
                  </span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Account Role & Permissions *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['CASHIER', 'ACCOUNTANT', 'ADMIN', 'DEVELOPER'] as UserRole[]).map(r => {
                        const cfg = ROLE_CONFIG[r];
                        const Icon = cfg.icon;
                        const isSelected = newRole === r;

                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setNewRole(r)}
                            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500'
                                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                              <span className="font-bold text-xs text-white">{cfg.label}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 leading-tight">
                              {r === 'CASHIER'
                                ? 'POS register & customer tabs'
                                : r === 'ACCOUNTANT'
                                ? 'Financial reports & bank reconciliations'
                                : r === 'ADMIN'
                                ? 'Full administrative control'
                                : 'Technical configs, vault & testing'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Samuel Adekunle or Ngozi Eze"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-indigo-500 outline-none"
                />
              </div>

              {/* Nigerian Mobile Number */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>Staff Phone Number (Nigeria) *</span>
                    <span className="text-[11px] font-normal text-slate-400">🇳🇬 +234</span>
                  </label>
                  {newPhone.trim() && (
                    <span
                      className={`text-[11px] font-semibold flex items-center gap-1 ${
                        isPhoneValid ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {isPhoneValid ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Valid Nigerian Mobile
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5" /> Invalid format
                        </>
                      )}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="e.g. 08031234567, 070..., 090..., 091... or +23480..."
                    className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none transition ${
                      !newPhone.trim()
                        ? 'border-slate-800 focus:border-indigo-500'
                        : isPhoneValid
                        ? 'border-emerald-500 focus:border-emerald-400'
                        : 'border-amber-500 focus:border-amber-400'
                    }`}
                  />
                </div>

                {/* Real-time validation message */}
                {newPhone.trim() && !isPhoneValid && (
                  <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {phoneValidation.error || 'Enter an 11-digit Nigerian mobile number starting with 070, 080, 081, 090, or 091.'}
                  </p>
                )}
                {isPhoneValid && (
                  <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    Verified normalized number: <span className="font-mono font-bold">{phoneValidation.normalized}</span>
                  </p>
                )}
              </div>

              {/* Security & Default Password Policy Banner */}
              <div className="p-3.5 bg-indigo-950/40 border border-indigo-800/50 rounded-xl text-xs space-y-1.5">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-indigo-400" />
                  Default Password & Security Protocol:
                </span>
                <ul className="text-[11px] text-slate-300 space-y-1 pl-4 list-disc">
                  <li>
                    The login username will be their normalized phone number (<span className="font-mono text-white">{phoneValidation.normalized || '080...'}</span>).
                  </li>
                  <li>
                    The initial default password is set strictly to their verified Nigerian phone number.
                  </li>
                  <li>
                    <strong className="text-amber-300 font-semibold">Mandatory Password Change:</strong> On their very first login attempt, the system will block navigation and require them to enter a new private password before accessing the system.
                  </li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !isPhoneValid || !newName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition cursor-pointer flex items-center gap-2"
                >
                  {creating ? (
                    <>
                      <GameInlineLoader label="CREATING..." />
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Create {ROLE_CONFIG[newRole].label}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* RESET PASSWORD MODAL */}
      {/* ======================================================== */}
      {resetModalUser && (
        <div
          onClick={() => setResetModalUser(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setResetModalUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-2 text-indigo-400">
              <KeyRound className="w-5 h-5" />
              <h3 className="font-bold text-white text-base">Reset Staff Password</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Reset access for <span className="font-bold text-white">{resetModalUser.name}</span> ({ROLE_CONFIG[resetModalUser.role]?.label || resetModalUser.role}).
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    New Password / Phone Number *
                  </label>
                  <button
                    type="button"
                    onClick={() => setResetPasswordVal(resetModalUser.phoneNumber || '')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    Use Phone Number ({resetModalUser.phoneNumber})
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={resetPasswordVal}
                  onChange={e => setResetPasswordVal(e.target.value)}
                  placeholder="Enter temporary password or phone number"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-xs text-amber-200">
                <p className="text-[11px]">
                  Setting this will enable the <strong className="font-bold">mandatory password change</strong> prompt, requiring {resetModalUser.name} to choose their own password immediately upon next login.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting || !resetPasswordVal.trim()}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {resetting ? 'Resetting...' : 'Confirm Password Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Async Loading Overlays */}
      {creating && (
        <GameDataLoadingOverlay
          label="INITIALIZING STAFF PROFILE..."
          sublabel="Hashing initial credentials, registering Nigerian mobile identity, and updating permissions matrix..."
        />
      )}
      {resetting && (
        <GameDataLoadingOverlay
          label="OVERRIDING CREDENTIALS..."
          sublabel="Updating cryptographic hash and enforcing password change requirement on next sign-in..."
        />
      )}
    </div>
  );
}

// Export alias so any imports of StaffManagementView or CashierManagementView work
export { CashierManagementView as StaffManagementView };
