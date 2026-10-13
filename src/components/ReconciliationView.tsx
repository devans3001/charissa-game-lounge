import React, { useState, useEffect } from 'react';
import { DailyReconciliation } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { formatNaira, getTodayLagosString, formatLagosDate, formatLagosDateTime, nairaToKobo, koboToNaira } from '../lib/utils.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Scale,
  Calendar,
  Save,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  Info
} from 'lucide-react';

export function ReconciliationView() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLagosString());
  const [reconciliation, setReconciliation] = useState<DailyReconciliation | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form inputs for actual counts
  const [actualCashNaira, setActualCashNaira] = useState<string>('0');
  const [actualPosNaira, setActualPosNaira] = useState<string>('0');
  const [actualTransferNaira, setActualTransferNaira] = useState<string>('0');
  const [posTerminalRef, setPosTerminalRef] = useState<string>('');
  const [bankSettlementNaira, setBankSettlementNaira] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Reopen modal state
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [reopening, setReopening] = useState<boolean>(false);

  useEffect(() => {
    loadReconciliationForDate(selectedDate);
  }, [selectedDate]);

  const loadReconciliationForDate = async (date: string) => {
    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      const res = await api.reconciliation.getDay(date);
      setReconciliation(res.reconciliation);
      setIsSaved(res.isSaved);

      // Populate input states
      setActualCashNaira(koboToNaira(res.reconciliation.actualCashKobo).toString());
      setActualPosNaira(koboToNaira(res.reconciliation.actualPosKobo).toString());
      setActualTransferNaira(koboToNaira(res.reconciliation.actualTransferKobo).toString());
      setPosTerminalRef(res.reconciliation.posTerminalReference || '');
      setBankSettlementNaira(
        res.reconciliation.bankSettlementTotalKobo !== undefined
          ? koboToNaira(res.reconciliation.bankSettlementTotalKobo).toString()
          : ''
      );
      setNotes(res.reconciliation.notes || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load reconciliation records');
    } finally {
      setLoading(false);
    }
  };

  // Calculated live values
  const inputCashKobo = nairaToKobo(actualCashNaira);
  const inputPosKobo = nairaToKobo(actualPosNaira);
  const inputTransferKobo = nairaToKobo(actualTransferNaira);
  const inputTotalKobo = inputCashKobo + inputPosKobo + inputTransferKobo;

  const recCash = reconciliation?.recordedCashKobo || 0;
  const recPos = reconciliation?.recordedPosKobo || 0;
  const recTrf = reconciliation?.recordedTransferKobo || 0;
  const recTotal = reconciliation?.recordedTotalKobo || 0;

  const liveDiffCash = inputCashKobo - recCash;
  const liveDiffPos = inputPosKobo - recPos;
  const liveDiffTrf = inputTransferKobo - recTrf;
  const liveDiffTotal = inputTotalKobo - recTotal;

  const isLocked = isSaved && reconciliation?.status === 'BALANCED';

  const handleSaveReconciliation = async (statusOverride?: string) => {
    if (isLocked) {
      setError('This business date is locked and reconciled. Please reopen it first to modify totals.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const res = await api.reconciliation.saveDay(selectedDate, {
        actualCashKobo: inputCashKobo,
        actualPosKobo: inputPosKobo,
        actualTransferKobo: inputTransferKobo,
        posTerminalReference: posTerminalRef,
        bankSettlementTotalKobo: bankSettlementNaira ? nairaToKobo(bankSettlementNaira) : undefined,
        notes,
        statusOverride,
        isReopenedEdit: reconciliation?.status === 'REOPENED',
      });

      setReconciliation(res.reconciliation);
      setIsSaved(true);
      setSuccessMessage(`Daily reconciliation successfully saved with status: ${res.reconciliation.status}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save reconciliation');
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim() || reopenReason.trim().length < 5) {
      setError('A comprehensive reason is required to reopen locked financial figures.');
      return;
    }

    try {
      setReopening(true);
      setError(null);
      const res = await api.reconciliation.reopen(selectedDate, reopenReason.trim());
      setReconciliation(res.reconciliation);
      setShowReopenModal(false);
      setReopenReason('');
      setSuccessMessage(`Reconciliation record for ${selectedDate} has been reopened for authorized adjustment.`);
    } catch (err: any) {
      setError(err.message || 'Failed to reopen reconciliation');
    } finally {
      setReopening(false);
    }
  };

  const getDiffBadge = (diffKobo: number) => {
    if (diffKobo === 0) {
      return (
        <span className="text-emerald-400 font-mono font-semibold text-xs flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> Balanced (₦0.00)
        </span>
      );
    } else if (diffKobo > 0) {
      return (
        <span className="text-blue-400 font-mono font-semibold text-xs flex items-center gap-1">
          <Info className="w-3.5 h-3.5" /> Over (+{formatNaira(diffKobo)})
        </span>
      );
    } else {
      return (
        <span className="text-rose-400 font-mono font-semibold text-xs flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Short ({formatNaira(diffKobo)})
        </span>
      );
    }
  };

  return (
    <div className="space-y-8">
      {/* Printable Report Header (visible only during print) */}
      <div className="hidden print-only mb-6 text-black">
        <h1 className="text-2xl font-bold">GAME LOUNGE - DAILY POS & CASH RECONCILIATION REPORT</h1>
        <p className="text-sm">Business Date: {formatLagosDate(selectedDate)} · Reconciled by: {user?.name}</p>
        <p className="text-xs text-gray-500">Printed: {formatLagosDateTime(new Date().toISOString())}</p>
      </div>

      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Scale className="w-6 h-6 text-indigo-400" />
            Daily POS & Sales Settlement Reconciliation
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Compare recorded cashier sales against physical drawer cash & POS terminal totals
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Date Switcher */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-white outline-none cursor-pointer font-mono"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm no-print">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-200 text-sm no-print">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Status banner */}
      <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
        isLocked
          ? 'bg-slate-900/90 border-emerald-800/80 text-emerald-300'
          : reconciliation?.status === 'DISCREPANCY_FOUND'
          ? 'bg-amber-950/25 border-amber-800/80 text-amber-300'
          : reconciliation?.status === 'REOPENED'
          ? 'bg-indigo-950/25 border-indigo-800/80 text-indigo-300'
          : 'bg-slate-900 border-slate-800 text-slate-300'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
            {isLocked ? (
              <Lock className="w-5 h-5 text-emerald-400" />
            ) : reconciliation?.status === 'REOPENED' ? (
              <Unlock className="w-5 h-5 text-indigo-400" />
            ) : (
              <Scale className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">
                Status: {reconciliation?.status || 'DRAFT'}
              </span>
              <span className="text-xs text-slate-400">· {formatLagosDate(selectedDate)}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isLocked
                ? `Finalized & Reconciled by ${reconciliation?.approvedByName || 'Admin'} on ${formatLagosDate(reconciliation?.updatedAt || '')}`
                : reconciliation?.status === 'REOPENED'
                ? `Reopened by ${reconciliation?.reopenedByName}: "${reconciliation?.reopenReason}"`
                : 'Pending daily closing review by manager or accountant'}
            </p>
          </div>
        </div>

        {isLocked && (
          <button
            type="button"
            onClick={() => setShowReopenModal(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-600/40 hover:bg-amber-600/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto no-print"
          >
            <Unlock className="w-3.5 h-3.5" />
            Authorize Reopen
          </button>
        )}
      </div>

      {/* Main Reconciliation Comparison Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: System Recorded Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 print-card">
          <div className="border-b border-slate-800 pb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 block">
              1. System Recorded Sales
            </span>
            <p className="text-xs text-slate-400 mt-0.5">Sum of all non-voided cashier transactions</p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-300">Recorded Cash:</span>
              <span className="font-mono font-bold text-white text-sm">{formatNaira(recCash)}</span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-300">Recorded POS / Card:</span>
              <span className="font-mono font-bold text-blue-400 text-sm">{formatNaira(recPos)}</span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-300">Recorded Bank Transfers:</span>
              <span className="font-mono font-bold text-violet-400 text-sm">{formatNaira(recTrf)}</span>
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-between items-baseline">
              <div>
                <span className="text-slate-200 font-semibold block text-sm">Total System Sales:</span>
                <span className="text-slate-400 text-[11px]">{reconciliation?.transactionCount || 0} transactions</span>
              </div>
              <span className="font-mono font-extrabold text-emerald-400 text-lg">
                {formatNaira(recTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Column 2: Physical / Actual Totals (Input) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 print-card">
          <div className="border-b border-slate-800 pb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
              2. Actual Physical & Terminal Settlement
            </span>
            <p className="text-xs text-slate-400 mt-0.5">Enter counted drawer cash & POS end-of-day total</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Actual Cash Counted (₦)
              </label>
              <input
                type="number"
                disabled={isLocked}
                value={actualCashNaira}
                onChange={e => setActualCashNaira(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:border-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Actual POS Terminal Reading (₦)
              </label>
              <input
                type="number"
                disabled={isLocked}
                value={actualPosNaira}
                onChange={e => setActualPosNaira(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:border-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Actual Bank Transfers Verified (₦)
              </label>
              <input
                type="number"
                disabled={isLocked}
                value={actualTransferNaira}
                onChange={e => setActualTransferNaira(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:border-indigo-500 outline-none disabled:opacity-60"
              />
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-between items-baseline">
              <span className="text-slate-200 font-semibold text-sm">Total Actual Payments:</span>
              <span className="font-mono font-extrabold text-white text-lg">
                {formatNaira(inputTotalKobo)}
              </span>
            </div>
          </div>
        </div>

        {/* Column 3: Variance & Discrepancy Analysis */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 print-card">
          <div className="border-b border-slate-800 pb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
              3. Independent Discrepancy Breakdown
            </span>
            <p className="text-xs text-slate-400 mt-0.5">Variance = Actual Total − Recorded Sales</p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-300">Cash Difference:</span>
              <div>{getDiffBadge(liveDiffCash)}</div>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-300">POS / Card Difference:</span>
              <div>{getDiffBadge(liveDiffPos)}</div>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-300">Transfer Difference:</span>
              <div>{getDiffBadge(liveDiffTrf)}</div>
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-between items-baseline">
              <span className="text-slate-200 font-bold text-sm">Net Overall Discrepancy:</span>
              <span className={`font-mono font-extrabold text-lg ${
                liveDiffTotal === 0 ? 'text-emerald-400' : liveDiffTotal > 0 ? 'text-blue-400' : 'text-rose-400'
              }`}>
                {liveDiffTotal > 0 ? `+${formatNaira(liveDiffTotal)}` : formatNaira(liveDiffTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal References & Reconciliation Notes */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 print-card">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          Terminal References & Reconciliation Audit Notes
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              POS Terminal Batch / End-of-Day Slip Reference
            </label>
            <input
              type="text"
              disabled={isLocked}
              value={posTerminalRef}
              onChange={e => setPosTerminalRef(e.target.value)}
              placeholder="e.g. STANBIC-POS-T09-BATCH-4029"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-indigo-500 outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Separate Bank Settlement Total (Optional ₦)
            </label>
            <input
              type="number"
              disabled={isLocked}
              value={bankSettlementNaira}
              onChange={e => setBankSettlementNaira(e.target.value)}
              placeholder="Optional bank statement credit figure"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-indigo-500 outline-none disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Reconciliation Notes / Remarks
          </label>
          <textarea
            disabled={isLocked}
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add explanation for any overage, shortage, customer payment issue, or drawer audit remark..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-indigo-500 outline-none disabled:opacity-60"
          />
        </div>

        {/* Action buttons */}
        {!isLocked && (
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3 no-print">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveReconciliation('DRAFT')}
              className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Save as Draft
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveReconciliation()}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Finalize & Save Reconciliation'}
            </button>
          </div>
        )}
      </div>

      {/* Modal: Authorize Reopen */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                <Unlock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Reopen Reconciled Day</h3>
                <p className="text-xs text-slate-400">Security audit log entry will be created</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Reopening a balanced day allows financial adjustments. You must supply an explicit reason that will be permanently tied to this action.
            </p>

            <form onSubmit={handleReopen} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Reason for Reopening *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                  placeholder="e.g. Correcting late POS batch settlement slip found in drawer after closing."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reopening}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {reopening ? 'Reopening...' : 'Confirm Reopen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
