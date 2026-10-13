import React, { useState, useEffect } from 'react';
import { BankAccount } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { formatLagosDateTime } from '../lib/utils.ts';
import { Landmark, Save, CheckCircle2, AlertTriangle } from 'lucide-react';

export function BankAccountsView() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Editable form state for the 3 slots
  const [forms, setForms] = useState<Record<number, { bankName: string; accountNumber: string; accountName: string; label: string; isActive: boolean }>>({
    1: { bankName: '', accountNumber: '', accountName: '', label: '', isActive: true },
    2: { bankName: '', accountNumber: '', accountName: '', label: '', isActive: true },
    3: { bankName: '', accountNumber: '', accountName: '', label: '', isActive: true },
  });
  const [savingSlot, setSavingSlot] = useState<number | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.bankAccounts.list();
      setAccounts(res.accounts);
      // Populate forms from existing accounts
      const nextForms: Record<number, any> = {
        1: { bankName: '', accountNumber: '', accountName: '', label: '', isActive: true },
        2: { bankName: '', accountNumber: '', accountName: '', label: '', isActive: true },
        3: { bankName: '', accountNumber: '', accountName: '', label: '', isActive: true },
      };
      for (const acc of res.accounts) {
        nextForms[acc.slotNumber] = {
          bankName: acc.bankName,
          accountNumber: acc.accountNumber,
          accountName: acc.accountName,
          label: acc.label || '',
          isActive: acc.isActive,
        };
      }
      setForms(nextForms);
    } catch (err: any) {
      setError(err.message || 'Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (slot: 1 | 2 | 3) => {
    const f = forms[slot];
    if (!f.bankName.trim() || !f.accountNumber.trim() || !f.accountName.trim()) {
      setError('Bank name, account number and account holder name are all required.');
      return;
    }
    try {
      setSavingSlot(slot);
      setError(null);
      await api.bankAccounts.updateSlot(slot, {
        bankName: f.bankName.trim(),
        accountNumber: f.accountNumber.trim(),
        accountName: f.accountName.trim(),
        label: f.label.trim() || undefined,
        isActive: f.isActive,
      });
      setSuccessMessage(`Bank account slot ${slot} saved. Cashiers will see the updated details immediately.`);
      setTimeout(() => setSuccessMessage(null), 5000);
      loadAccounts();
    } catch (err: any) {
      setError(err.message || 'Failed to save bank account');
    } finally {
      setSavingSlot(null);
    }
  };

  const updateForm = (slot: number, field: string, value: any) => {
    setForms(prev => ({
      ...prev,
      [slot]: { ...prev[slot], [field]: value },
    }));
  };

  const slotLabels = ['Primary Account', 'Secondary Account', 'Backup Account'];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Landmark className="w-6 h-6 text-violet-400" />
          Bank Transfer Accounts
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Up to 3 account slots shown to cashiers at checkout when a customer pays by bank transfer. Edit anytime — every change is audit-logged.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 flex items-center justify-center text-slate-400 text-xs font-mono">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mr-3" />
          Loading bank accounts...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {([1, 2, 3] as const).map(slot => {
            const existing = accounts.find(a => a.slotNumber === slot);
            const f = forms[slot];
            return (
              <div key={slot} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white text-sm">Slot {slot}</h3>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">{slotLabels[slot - 1]}</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.isActive}
                      onChange={e => updateForm(slot, 'isActive', e.target.checked)}
                      className="accent-emerald-500 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-400 font-semibold">Visible</span>
                  </label>
                </div>

                <div className="space-y-3 flex-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Bank Name *</label>
                    <input
                      type="text"
                      value={f.bankName}
                      onChange={e => updateForm(slot, 'bankName', e.target.value)}
                      placeholder="e.g. GTBank / Opay / Zenith"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-violet-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Account Number *</label>
                    <input
                      type="text"
                      value={f.accountNumber}
                      onChange={e => updateForm(slot, 'accountNumber', e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="e.g. 0123456789"
                      maxLength={14}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-violet-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Account Holder Name *</label>
                    <input
                      type="text"
                      value={f.accountName}
                      onChange={e => updateForm(slot, 'accountName', e.target.value)}
                      placeholder="e.g. Charissa Game Lounge Ltd"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-violet-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Label (optional)</label>
                    <input
                      type="text"
                      value={f.label}
                      onChange={e => updateForm(slot, 'label', e.target.value)}
                      placeholder="e.g. Main business account"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-violet-500 outline-none"
                    />
                  </div>
                </div>

                {existing && (
                  <div className="mt-3 text-[10px] text-slate-500 font-mono">
                    Last updated by {existing.updatedByName} · {formatLagosDateTime(existing.updatedAt)}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleSave(slot)}
                  disabled={savingSlot === slot}
                  className="mt-4 w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {savingSlot === slot ? (
                    'Saving...'
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      {existing ? 'Update Slot' : 'Create Slot'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
