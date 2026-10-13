import React, { useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { KeyRound, Lock, AlertCircle, CheckCircle2, X, ShieldAlert } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  isMandatory?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

export function ChangePasswordModal({
  isOpen,
  isMandatory = false,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  const { user, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isMandatory && !currentPassword.trim()) {
      setError('Please provide your current password.');
      return;
    }

    if (!newPassword.trim() || newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.auth.changePassword({
        currentPassword: currentPassword.trim() || undefined,
        newPassword: newPassword.trim(),
      });

      setSuccess('Your password has been successfully updated!');
      await refreshUser();

      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onClose && !isMandatory) onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
        {!isMandatory && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2.5 rounded-xl ${isMandatory ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
            {isMandatory ? <ShieldAlert className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="font-bold text-white text-base">
              {isMandatory ? 'First Login: Set Your New Password' : 'Change Account Password'}
            </h3>
            <p className="text-xs text-slate-400">
              {isMandatory
                ? 'Your default password was set to your phone number. Please choose a new secure password to continue.'
                : `Update password for ${user?.name}`}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2.5 text-red-200 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center gap-2.5 text-emerald-200 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isMandatory && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Current Password *
              </label>
              <div className="relative rounded-xl">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              New Password (minimum 6 characters) *
            </label>
            <div className="relative rounded-xl">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new confidential password"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Confirm New Password *
            </label>
            <div className="relative rounded-xl">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            {!isMandatory && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 rounded-xl font-semibold text-xs text-white transition shadow-lg cursor-pointer flex items-center gap-2 ${
                isMandatory
                  ? 'w-full justify-center bg-amber-600 hover:bg-amber-500 shadow-amber-600/25'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              {loading ? 'Saving Password...' : isMandatory ? 'Set Password & Enter Counter' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
