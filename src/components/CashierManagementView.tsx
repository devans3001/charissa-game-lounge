import React, { useState, useEffect } from 'react';
import { User } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { formatNaira, formatLagosDateTime } from '../lib/utils.ts';
import {
  Users,
  UserPlus,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  CheckCircle2,
  X,
  ShieldAlert,
  Clock
} from 'lucide-react';

interface CashierWithStats extends User {
  totalTransactions: number;
  totalSalesKobo: number;
  todayTransactions: number;
  todaySalesKobo: number;
}

export function CashierManagementView() {
  const [cashiers, setCashiers] = useState<CashierWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  // Reset password modal
  const [resetModalUser, setResetModalUser] = useState<CashierWithStats | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadCashiers();
  }, []);

  const loadCashiers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.cashiers.list();
      setCashiers(res.cashiers as CashierWithStats[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load cashier accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (cashier: CashierWithStats) => {
    try {
      setError(null);
      await api.cashiers.toggleStatus(cashier.id, !cashier.isActive);
      setSuccessMessage(
        `Cashier account "${cashier.name}" has been ${!cashier.isActive ? 'activated' : 'deactivated'}.`
      );
      loadCashiers();
    } catch (err: any) {
      setError(err.message || 'Failed to update cashier status');
    }
  };

  const handleCreateCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      setError('Please provide staff name and phone number.');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const res = await api.cashiers.create({
        name: newName.trim(),
        phoneNumber: newPhone.trim(),
      });

      setSuccessMessage(
        `Cashier account for "${newName}" created! Default password is ${res.cashier.phoneNumber}. The cashier will be prompted to change their password on first login.`
      );
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      loadCashiers();
    } catch (err: any) {
      setError(err.message || 'Failed to create cashier');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !resetPasswordVal || resetPasswordVal.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      setResetting(true);
      setError(null);
      await api.cashiers.resetPassword(resetModalUser.id, resetPasswordVal);
      setSuccessMessage(`Password for "${resetModalUser.name}" successfully reset.`);
      setResetModalUser(null);
      setResetPasswordVal('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Cashier Staff & Account Management
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage cashier accounts, shift logins, security credentials, and sales accountability
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Add Cashier Account
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Cashiers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cashiers.map(c => (
          <div
            key={c.id}
            className={`p-5 rounded-2xl border transition flex flex-col justify-between ${
              c.isActive
                ? 'bg-slate-900 border-slate-800'
                : 'bg-slate-950/80 border-slate-800/60 opacity-60'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">{c.name}</h3>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Username: <span className="text-slate-200 font-semibold">{c.username}</span> · 📞 {c.phoneNumber}
                    </div>
                    {c.mustChangePassword && (
                      <span className="text-[10px] text-amber-400 font-medium block mt-0.5">
                        Default password active (pending first login change)
                      </span>
                    )}
                  </div>
                </div>

                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                  c.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                }`}>
                  {c.isActive ? 'Active Staff' : 'Deactivated'}
                </span>
              </div>

              {/* Shift Stats Card */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 my-3 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Today's Shift Sales:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatNaira(c.todaySalesKobo)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Today's Transactions:</span>
                  <span className="font-mono text-slate-200">{c.todayTransactions} sales</span>
                </div>
                <div className="border-t border-slate-800/80 pt-2 flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">Lifetime Collected:</span>
                  <span className="font-mono font-semibold text-slate-300">
                    {formatNaira(c.totalSalesKobo)} ({c.totalTransactions} total)
                  </span>
                </div>
              </div>

              {c.lastLoginAt && (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5" />
                  Last login: {formatLagosDateTime(c.lastLoginAt)}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleToggleStatus(c)}
                className={`text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  c.isActive ? 'text-slate-400 hover:text-rose-400' : 'text-emerald-400 hover:text-emerald-300'
                }`}
              >
                {c.isActive ? (
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
                onClick={() => { setResetModalUser(c); setResetPasswordVal(''); }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Reset Password
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Cashier Modal */}
      {showAddModal && (
        <div onClick={() => setShowAddModal(false)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">Create Cashier Account</h3>
            <p className="text-xs text-slate-400 mb-4">
              Provision a new staff member for daily transaction entry
            </p>

            <form onSubmit={handleCreateCashier} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Staff Full Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Samuel Adekunle"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Staff Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="e.g. 08031234567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="p-3 bg-indigo-950/30 border border-indigo-800/40 rounded-xl text-xs text-indigo-300 space-y-1">
                <span className="font-semibold block text-white">Default Credentials Policy:</span>
                <p className="text-[11px] text-slate-300">
                  • The cashier's login username will be their phone number.
                  <br />
                  • Their initial default password will be their phone number.
                  <br />
                  • Upon their first sign-in, the system will automatically prompt them to choose a secure permanent password.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Cashier Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalUser && (
        <div onClick={() => setResetModalUser(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setResetModalUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3 text-indigo-400">
              <KeyRound className="w-5 h-5" />
              <h3 className="font-bold text-white text-base">Reset Cashier Password</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Enter a new password for <span className="font-bold text-white">{resetModalUser.name}</span> (@{resetModalUser.username}).
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">New Password *</label>
                <input
                  type="password"
                  required
                  value={resetPasswordVal}
                  onChange={e => setResetPasswordVal(e.target.value)}
                  placeholder="Enter new 6+ char password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:border-indigo-500 outline-none"
                />
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
                  disabled={resetting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {resetting ? 'Resetting...' : 'Set New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
