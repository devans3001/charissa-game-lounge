import React, { useState, useEffect } from 'react';
import { Transaction, PaymentMethod, GameCategory, TransactionStatus } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { formatNaira, formatLagosDateTime, formatLagosDate } from '../lib/utils.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Search,
  Filter,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Ban,
  Pencil,
  RotateCcw,
  Receipt,
  Eye,
  X,
  FileQuestion
} from 'lucide-react';

export function TransactionsView() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sort, setSort] = useState<string>('newest');

  // Modals
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [voidModalTxn, setVoidModalTxn] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [voiding, setVoiding] = useState<boolean>(false);

  const [correctModalTxn, setCorrectModalTxn] = useState<Transaction | null>(null);
  const [correctReason, setCorrectReason] = useState<string>('');
  const [correctMethod, setCorrectMethod] = useState<PaymentMethod>('CASH');
  const [correctRef, setCorrectRef] = useState<string>('');
  const [correcting, setCorrecting] = useState<boolean>(false);

  // Cashier Request Correction modal
  const [requestModalTxn, setRequestModalTxn] = useState<Transaction | null>(null);
  const [requestReason, setRequestReason] = useState<string>('');
  const [requestAction, setRequestAction] = useState<'VOID' | 'CHANGE_PAYMENT_METHOD'>('VOID');
  const [requestMethod, setRequestMethod] = useState<PaymentMethod>('POS');
  const [requesting, setRequesting] = useState<boolean>(false);

  useEffect(() => {
    loadTransactions();
  }, [page, category, paymentMethod, status, startDate, endDate, sort]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.transactions.list({
        page,
        limit: 20,
        search,
        category,
        paymentMethod,
        status,
        startDate,
        endDate,
        sort,
      });
      setTransactions(res.transactions);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      setError(err.message || 'Failed to load transaction ledger');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadTransactions();
  };

  const handleExportCsv = () => {
    const query = new URLSearchParams();
    if (startDate) query.append('startDate', startDate);
    if (endDate) query.append('endDate', endDate);
    if (category) query.append('category', category);
    if (paymentMethod) query.append('paymentMethod', paymentMethod);
    if (status) query.append('status', status);

    const token = localStorage.getItem('gamelounge_auth_token');
    const url = `/api/export/transactions.csv?${query.toString()}`;

    // Download using authenticated fetch blob
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `game_lounge_sales_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => alert('Failed to export CSV: ' + err.message));
  };

  // Void submission
  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalTxn || !voidReason.trim() || voidReason.trim().length < 4) {
      setError('Please provide a descriptive reason for voiding this record.');
      return;
    }

    try {
      setVoiding(true);
      setError(null);
      await api.transactions.void(voidModalTxn.id, voidReason.trim());
      setVoidModalTxn(null);
      setVoidReason('');
      loadTransactions();
    } catch (err: any) {
      setError(err.message || 'Failed to void transaction');
    } finally {
      setVoiding(false);
    }
  };

  // Correction submission
  const handleConfirmCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctModalTxn || !correctReason.trim() || correctReason.trim().length < 4) {
      setError('Please provide a reason explaining this correction.');
      return;
    }

    try {
      setCorrecting(true);
      setError(null);
      await api.transactions.correct(correctModalTxn.id, {
        reason: correctReason.trim(),
        paymentMethod: correctMethod,
        paymentReference: correctRef.trim(),
      });
      setCorrectModalTxn(null);
      setCorrectReason('');
      loadTransactions();
    } catch (err: any) {
      setError(err.message || 'Failed to correct transaction');
    } finally {
      setCorrecting(false);
    }
  };

  // Cashier request correction submission
  const handleConfirmRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestModalTxn || !requestReason.trim()) {
      setError('Please explain the mistake.');
      return;
    }

    try {
      setRequesting(true);
      setError(null);
      await api.transactions.requestCorrection(requestModalTxn.id, {
        reason: requestReason.trim(),
        requestedAction: requestAction,
        proposedPaymentMethod: requestAction === 'CHANGE_PAYMENT_METHOD' ? requestMethod : undefined,
      });
      setRequestModalTxn(null);
      setRequestReason('');
      alert('Correction request submitted to manager/admin for review.');
    } catch (err: any) {
      setError(err.message || 'Failed to submit correction request');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-indigo-400" />
            {user?.role === 'ADMIN' ? 'All Transactions Ledger' : 'My Recorded Sales'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {user?.role === 'ADMIN'
              ? 'Complete financial audit log of all games sold across all cashiers'
              : 'Audit history of your personal recorded shift transactions'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print Ledger
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm no-print">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 no-print">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search receipt number, slip reference, game, or cashier name..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer shrink-0"
          >
            Search
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
          {/* Category */}
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none"
          >
            <option value="">All Categories</option>
            <option value="PS_GAME">PlayStation</option>
            <option value="SNOOKER">Snooker</option>
            <option value="COIN_GAME">Coin Games</option>
          </select>

          {/* Payment Method */}
          <select
            value={paymentMethod}
            onChange={e => { setPaymentMethod(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none"
          >
            <option value="">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="POS">POS / Card</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </select>

          {/* Status */}
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="VOIDED">Voided</option>
            <option value="CORRECTED">Corrected</option>
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => { setSort(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="amount_desc">Highest Amount</option>
            <option value="amount_asc">Lowest Amount</option>
          </select>

          {/* Start Date */}
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none font-mono"
            placeholder="From Date"
          />

          {/* End Date */}
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-300 outline-none font-mono"
            placeholder="To Date"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden print-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400">
                <th className="py-3 px-4 font-semibold">Receipt No.</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Game</th>
                <th className="py-3 px-4 font-semibold">Method & Slip</th>
                <th className="py-3 px-4 font-semibold text-right">Amount (₦)</th>
                <th className="py-3 px-4 font-semibold">Cashier</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {transactions.map(t => (
                <tr
                  key={t.id}
                  className={`hover:bg-slate-800/40 transition ${t.status === 'VOIDED' ? 'opacity-50 line-through' : ''}`}
                >
                  <td className="py-3 px-4 text-white font-semibold whitespace-nowrap">
                    {t.receiptNumber}
                  </td>
                  <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                    {formatLagosDateTime(t.timestamp)}
                  </td>
                  <td className="py-3 px-4 font-sans text-white">
                    <div className="font-medium flex items-center gap-1.5">
                      <span>{t.gameName}</span>
                      {t.items && t.items.length > 1 && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                          {t.items.length} games
                        </span>
                      )}
                    </div>
                    {t.customerName && (
                      <div className="text-[11px] text-amber-300 font-medium">
                        👤 {t.customerName}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 font-mono">
                      {t.gameCategory.replace('_', ' ')}
                      {t.coinsRequiredSnapshot && ` · ${t.coinsRequiredSnapshot} coins`}
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-semibold text-slate-200">{t.paymentMethod}</span>
                    {t.senderName && (
                      <span className="text-[10px] text-violet-300 block font-sans font-medium">
                        Sender: {t.senderName}
                      </span>
                    )}
                    {t.paymentReference && (
                      <span className="text-[10px] text-indigo-400 block font-mono">
                        Ref: {t.paymentReference}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-400 text-sm whitespace-nowrap">
                    {formatNaira(t.totalAmountKobo)}
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-300 whitespace-nowrap">
                    {t.cashierName}
                  </td>
                  <td className="py-3 px-4 font-sans whitespace-nowrap">
                    {t.status === 'COMPLETED' ? (
                      <span className="text-emerald-400 text-[11px] font-semibold">Active</span>
                    ) : t.status === 'VOIDED' ? (
                      <span className="text-rose-400 text-[11px] font-semibold">Voided</span>
                    ) : (
                      <span className="text-amber-400 text-[11px] font-semibold">Corrected</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right no-print whitespace-nowrap font-sans">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* View details */}
                      <button
                        type="button"
                        onClick={() => setSelectedTxn(t)}
                        title="View details"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Admin: Void action */}
                      {user?.role === 'ADMIN' && t.status !== 'VOIDED' && (
                        <button
                          type="button"
                          onClick={() => { setVoidModalTxn(t); setVoidReason(''); }}
                          title="Void transaction"
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}

                      {/* Admin: Correct payment action */}
                      {user?.role === 'ADMIN' && t.status !== 'VOIDED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCorrectModalTxn(t);
                            setCorrectMethod(t.paymentMethod);
                            setCorrectRef(t.paymentReference || '');
                            setCorrectReason('');
                          }}
                          title="Correct payment method/slip"
                          className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {/* Cashier: Request Correction */}
                      {user?.role === 'CASHIER' && t.status !== 'VOIDED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestModalTxn(t);
                            setRequestReason('');
                          }}
                          title="Flag mistake for admin review"
                          className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 transition flex items-center gap-1 text-[11px]"
                        >
                          <FileQuestion className="w-3.5 h-3.5" />
                          Fix
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {transactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                    No transactions found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 no-print">
          <div>
            Showing {transactions.length} of {total} records (Page {page} of {totalPages})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Transaction Details Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedTxn(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">Transaction Details</h3>
            <p className="text-xs text-slate-400 mb-4 font-mono">{selectedTxn.receiptNumber}</p>

            <div className="space-y-3 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono">
              {selectedTxn.customerName && (
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Customer:</span>
                  <span className="font-bold text-amber-300 font-sans">{selectedTxn.customerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Game Item:</span>
                <span className="font-semibold text-white font-sans">{selectedTxn.gameName}</span>
              </div>
              {selectedTxn.items && selectedTxn.items.length > 0 && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1 font-sans">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Itemized Breakdown:</span>
                  {selectedTxn.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-200">{it.gameName} x{it.quantity}</span>
                      <span className="font-mono text-emerald-400">{formatNaira(it.totalAmountKobo)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Category:</span>
                <span>{selectedTxn.gameCategory}</span>
              </div>
              {selectedTxn.coinsRequiredSnapshot && (
                <div className="flex justify-between text-amber-300">
                  <span>Coins Required:</span>
                  <span>{selectedTxn.coinsRequiredSnapshot} coins</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Plays Quantity:</span>
                <span>{selectedTxn.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Collected:</span>
                <span className="font-bold text-emerald-400 text-sm">{formatNaira(selectedTxn.totalAmountKobo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payment Method:</span>
                <span className="text-indigo-400 font-semibold">{selectedTxn.paymentMethod}</span>
              </div>
              {selectedTxn.senderName && (
                <div className="flex justify-between text-violet-300">
                  <span className="text-slate-400">Transfer Sender:</span>
                  <span className="font-semibold text-white font-sans">{selectedTxn.senderName}</span>
                </div>
              )}
              {selectedTxn.paymentReference && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Slip Reference:</span>
                  <span className="text-slate-200">{selectedTxn.paymentReference}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Cashier:</span>
                <span className="font-sans">{selectedTxn.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Timestamp:</span>
                <span>{formatLagosDateTime(selectedTxn.timestamp)}</span>
              </div>

              {selectedTxn.status === 'VOIDED' && (
                <div className="pt-2 border-t border-slate-800 text-rose-400 space-y-1">
                  <div className="font-semibold">STATUS: VOIDED</div>
                  <div>Voided by: {selectedTxn.voidedByName}</div>
                  <div>Reason: "{selectedTxn.voidReason}"</div>
                </div>
              )}

              {selectedTxn.status === 'CORRECTED' && (
                <div className="pt-2 border-t border-slate-800 text-amber-300 space-y-1">
                  <div className="font-semibold">STATUS: CORRECTED</div>
                  <div>Corrected by: {selectedTxn.correctedByName}</div>
                  <div>Audit Note: "{selectedTxn.correctionNote}"</div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTxn(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Void Modal */}
      {voidModalTxn && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <div className="flex items-center gap-3 mb-3 text-rose-400">
              <Ban className="w-6 h-6" />
              <h3 className="font-bold text-white text-base">Void Financial Transaction</h3>
            </div>

            <p className="text-xs text-slate-300 mb-2">
              Voiding <span className="font-mono text-white font-bold">{voidModalTxn.receiptNumber}</span> ({formatNaira(voidModalTxn.totalAmountKobo)}) will remove it from active revenue totals while preserving it in historical audit logs.
            </p>

            <form onSubmit={handleConfirmVoid} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Audit Reason for Voiding *
                </label>
                <textarea
                  required
                  rows={3}
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  placeholder="e.g. Customer cancelled play before startup; refund issued."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:border-rose-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setVoidModalTxn(null)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voiding}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {voiding ? 'Voiding...' : 'Authorize Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Correct Modal */}
      {correctModalTxn && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <div className="flex items-center gap-3 mb-3 text-amber-400">
              <Pencil className="w-5 h-5" />
              <h3 className="font-bold text-white text-base">Correct Payment Method / Slip</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Receipt: <span className="font-mono text-white font-bold">{correctModalTxn.receiptNumber}</span>
            </p>

            <form onSubmit={handleConfirmCorrection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={correctMethod}
                  onChange={e => setCorrectMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="CASH">Cash</option>
                  <option value="POS">POS / Card Terminal</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Slip Reference / RRN
                </label>
                <input
                  type="text"
                  value={correctRef}
                  onChange={e => setCorrectRef(e.target.value)}
                  placeholder="Slip reference number"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Reason for Correction *
                </label>
                <textarea
                  required
                  rows={2}
                  value={correctReason}
                  onChange={e => setCorrectReason(e.target.value)}
                  placeholder="e.g. Cashier misclassified payment as cash instead of card slip"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCorrectModalTxn(null)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correcting}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {correcting ? 'Saving...' : 'Apply Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cashier Request Correction Modal */}
      {requestModalTxn && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <div className="flex items-center gap-3 mb-3 text-amber-400">
              <FileQuestion className="w-5 h-5" />
              <h3 className="font-bold text-white text-base">Request Error Correction</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Cashiers cannot directly alter historical sales. Submit an authorized request for the manager to review and correct receipt <span className="font-mono text-white font-semibold">{requestModalTxn.receiptNumber}</span>.
            </p>

            <form onSubmit={handleConfirmRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Requested Action
                </label>
                <select
                  value={requestAction}
                  onChange={e => setRequestAction(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="VOID">Void Transaction (Customer didn't play or duplicate entry)</option>
                  <option value="CHANGE_PAYMENT_METHOD">Change Payment Method (e.g. Cash to POS)</option>
                </select>
              </div>

              {requestAction === 'CHANGE_PAYMENT_METHOD' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Correct Payment Method
                  </label>
                  <select
                    value={requestMethod}
                    onChange={e => setRequestMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="POS">POS / Card Terminal</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Explanation of Mistake *
                </label>
                <textarea
                  required
                  rows={3}
                  value={requestReason}
                  onChange={e => setRequestReason(e.target.value)}
                  placeholder="Explain exactly what happened so the admin can verify..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRequestModalTxn(null)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requesting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {requesting ? 'Submitting...' : 'Send to Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
