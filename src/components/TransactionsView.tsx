import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Transaction, PaymentMethod, GameCategory, TransactionStatus, CorrectionRequest } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { formatNaira, formatLagosDateTime, formatLagosDate } from '../lib/utils.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { queryClient, queryKeys } from '../lib/queryClient.ts';
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
  FileQuestion,
  LayoutGrid,
  List,
  SlidersHorizontal,
  BookmarkCheck,
  Clock3
} from 'lucide-react';
import { GameTableSkeleton, GameInlineLoader, GameDataLoadingOverlay } from './game-ui/index.ts';

interface TransactionsViewProps {
  onNavigateToFixRequests?: () => void;
}

export function TransactionsView({ onNavigateToFixRequests }: TransactionsViewProps = {}) {
  const { user } = useAuth();
  const [page, setPage] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  // Does this transaction carry physical coins? (drives the void coin question)
  const isCoinTxn = (t: Transaction | null): boolean => {
    if (!t) return false;
    if (Array.isArray(t.items) && t.items.length > 0) {
      return t.items.some(it => it.gameCategory === 'COIN_GAME');
    }
    return t.gameCategory === 'COIN_GAME';
  };

  // Coins on a transaction (single-item or multi-item)
  const coinCountOf = (t: Transaction | null): number => {
    if (!t) return 0;
    if (Array.isArray(t.items) && t.items.length > 0) {
      return t.items
        .filter(it => it.gameCategory === 'COIN_GAME')
        .reduce((s, it) => s + (it.coinsRequiredSnapshot || 0) * (it.quantity || 1), 0);
    }
    return t.gameCategory === 'COIN_GAME' ? (t.coinsRequiredSnapshot || 0) * (t.quantity || 1) : 0;
  };

  // Badge showing whether a sale has a pending/approved/rejected fix request
  const renderFixFlag = (txnId: string) => {
    const req = requestsByTxn.get(txnId);
    if (!req) return null;
    const label =
      req.status === 'PENDING'
        ? 'FIX REQUESTED'
        : req.status === 'APPROVED'
        ? 'FIX APPROVED'
        : 'FIX REJECTED';
    const cls =
      req.status === 'PENDING'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
        : req.status === 'APPROVED'
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
        : 'bg-rose-500/15 text-rose-300 border-rose-500/40';
    return (
      <span
        title={`Fix request ${req.status} — "${req.reason}"`}
        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border flex items-center gap-1 w-fit ${cls}`}
      >
        <FileQuestion className="w-3 h-3" />
        {label}
      </span>
    );
  };

  // Responsive View Mode: 'AUTO' (Cards on mobile, Table on desktop), or explicit 'CARD' / 'TABLE'
  const [viewMode, setViewMode] = useState<'AUTO' | 'CARD' | 'TABLE'>('AUTO');
  const [showFiltersMobile, setShowFiltersMobile] = useState<boolean>(false);

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
  // COIN_GAME voids only: were the physical coins handed back into the drawer?
  const [voidCoinsReturned, setVoidCoinsReturned] = useState<boolean | null>(null);

  const [correctModalTxn, setCorrectModalTxn] = useState<Transaction | null>(null);
  const [correctReason, setCorrectReason] = useState<string>('');
  const [correctMethod, setCorrectMethod] = useState<PaymentMethod>('CASH');
  const [correctRef, setCorrectRef] = useState<string>('');

  // Cashier Request Correction modal
  const [requestModalTxn, setRequestModalTxn] = useState<Transaction | null>(null);
  const [requestReason, setRequestReason] = useState<string>('');
  const [requestAction, setRequestAction] = useState<'VOID' | 'CHANGE_PAYMENT_METHOD'>('VOID');
  const [requestMethod, setRequestMethod] = useState<PaymentMethod>('POS');

  // TanStack Queries
  const {
    data: txnData,
    isLoading: loading,
    refetch: loadTransactions,
  } = useQuery({
    queryKey: queryKeys.transactions({
      page,
      limit: 20,
      search,
      category,
      paymentMethod,
      status,
      startDate,
      endDate,
      sort,
    }),
    queryFn: () =>
      api.transactions.list({
        page,
        limit: 20,
        search,
        category,
        paymentMethod,
        status,
        startDate,
        endDate,
        sort,
      }),
    refetchInterval: 12_000,
  });

  const transactions = txnData?.transactions || [];
  const total = txnData?.total || 0;
  const totalPages = txnData?.totalPages || 1;

  const { data: reqData } = useQuery({
    queryKey: queryKeys.correctionRequests(),
    queryFn: () => api.correctionRequests.list(),
    refetchInterval: 12_000,
  });
  const correctionRequests = reqData?.requests || [];

  // Map transactionId -> latest correction request for that sale
  const requestsByTxn = new Map<string, CorrectionRequest>();
  for (const r of correctionRequests) {
    const existing = requestsByTxn.get(r.transactionId);
    if (!existing || new Date(r.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      requestsByTxn.set(r.transactionId, r);
    }
  }
  const pendingFixCount = correctionRequests.filter(r => r.status === 'PENDING').length;

  // TanStack Mutations with query invalidation
  const voidMutation = useMutation({
    mutationFn: async ({ txnId, reason, returnCoinsToCashier }: { txnId: string; reason: string; returnCoinsToCashier?: boolean }) => {
      return api.transactions.void(txnId, reason, returnCoinsToCashier);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['coinBalances'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      const returned = voidCoinsReturned === true;
      const coins = coinCountOf(voidModalTxn);
      showToast(
        isCoinTxn(voidModalTxn)
          ? `Sale voided — ${coins} coin(s) ${returned ? 'returned to the cashier' : 'kept deducted (lost)'} float.`
          : 'Sale voided. It is removed from revenue totals but kept in the audit trail.'
      );
      setVoidModalTxn(null);
      setVoidReason('');
      setVoidCoinsReturned(null);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to void transaction');
    },
  });

  const correctMutation = useMutation({
    mutationFn: async ({
      txnId,
      reason,
      paymentMethod,
      paymentReference,
    }: {
      txnId: string;
      reason: string;
      paymentMethod: PaymentMethod;
      paymentReference?: string;
    }) => {
      return api.transactions.correct(txnId, { reason, paymentMethod, paymentReference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      setCorrectModalTxn(null);
      setCorrectReason('');
      showToast('Transaction correction recorded successfully.');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to correct transaction');
    },
  });

  const requestCorrectionMutation = useMutation({
    mutationFn: async ({
      txnId,
      reason,
      requestedAction,
      proposedPaymentMethod,
    }: {
      txnId: string;
      reason: string;
      requestedAction: 'VOID' | 'CHANGE_PAYMENT_METHOD';
      proposedPaymentMethod?: PaymentMethod;
    }) => {
      return api.transactions.requestCorrection(txnId, {
        reason,
        requestedAction,
        proposedPaymentMethod,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correctionRequests'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setRequestModalTxn(null);
      setRequestReason('');
      showToast('Fix request sent to the manager/admin for review. The ledger now shows it as flagged.');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to submit correction request');
    },
  });

  const voiding = voidMutation.isPending;
  const correcting = correctMutation.isPending;
  const requesting = requestCorrectionMutation.isPending;

  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => setSuccessToast(null), 4500);
    return () => clearTimeout(timer);
  }, [successToast]);

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
      .catch(err => setError('Failed to export CSV: ' + err.message));
  };

  // Void submission
  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalTxn || !voidReason.trim() || voidReason.trim().length < 4) {
      setError('Please provide a descriptive reason for voiding this record.');
      return;
    }

    if (isCoinTxn(voidModalTxn) && voidCoinsReturned === null) {
      setError('State whether the coins were physically returned to the drawer before voiding.');
      return;
    }

    setError(null);
    voidMutation.mutate({
      txnId: voidModalTxn.id,
      reason: voidReason.trim(),
      returnCoinsToCashier: isCoinTxn(voidModalTxn) ? voidCoinsReturned === true : undefined,
    });
  };

  // Correction submission
  const handleConfirmCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctModalTxn || !correctReason.trim() || correctReason.trim().length < 4) {
      setError('Please provide a reason explaining this correction.');
      return;
    }

    setError(null);
    correctMutation.mutate({
      txnId: correctModalTxn.id,
      reason: correctReason.trim(),
      paymentMethod: correctMethod,
      paymentReference: correctRef.trim(),
    });
  };

  // Cashier request correction submission
  const handleConfirmRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestModalTxn || !requestReason.trim()) {
      setError('Please explain the mistake.');
      return;
    }

    setError(null);
    requestCorrectionMutation.mutate({
      txnId: requestModalTxn.id,
      reason: requestReason.trim(),
      requestedAction: requestAction,
      proposedPaymentMethod: requestAction === 'CHANGE_PAYMENT_METHOD' ? requestMethod : undefined,
    });
  };

  const activeFiltersCount = [
    category,
    paymentMethod,
    status,
    startDate,
    endDate,
    sort !== 'newest' ? sort : ''
  ].filter(Boolean).length;

  const handleResetFilters = () => {
    setSearch('');
    setCategory('');
    setPaymentMethod('');
    setStatus('');
    setStartDate('');
    setEndDate('');
    setSort('newest');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl shadow-emerald-950/60 flex items-center gap-3 border border-emerald-400/40 animate-in fade-in slide-in-from-top-4 no-print">
          <BookmarkCheck className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{successToast}</span>
        </div>
      )}

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

        <div className="flex items-center gap-2.5 flex-wrap">
          {loading && (
            <div className="px-2.5 py-1 bg-indigo-950/60 border border-indigo-900/60 rounded-lg text-indigo-300">
              <GameInlineLoader label="QUERYING ARCHIVE..." variant="pulse" />
            </div>
          )}

          {/* Card / Table View Toggle for responsive flexibility */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-0.5 flex items-center">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'CARD' ? 'AUTO' : 'CARD')}
              title="Card view (optimized for mobile & touch)"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[36px] ${
                viewMode === 'CARD'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'TABLE' ? 'AUTO' : 'TABLE')}
              title="Table view (dense multi-column grid)"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[36px] ${
                viewMode === 'TABLE'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          {user?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer min-h-[38px]"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer min-h-[38px]"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print Ledger</span>
          </button>

          {pendingFixCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigateToFixRequests && onNavigateToFixRequests()}
              className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-2 transition cursor-pointer min-h-[38px]"
            >
              <Clock3 className="w-4 h-4" />
              {pendingFixCount} pending fix {pendingFixCount === 1 ? 'request' : 'requests'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm no-print">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 no-print">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search receipt, slip ref, customer, game, cashier..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm sm:text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none min-h-[42px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 sm:flex-none px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer min-h-[42px]"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowFiltersMobile(!showFiltersMobile)}
              className={`sm:hidden px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition min-h-[42px] ${
                activeFiltersCount > 0
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}</span>
            </button>
          </div>
        </form>

        {/* Filter Dropdowns: Visible on sm+ or toggled open on mobile */}
        <div className={`${showFiltersMobile ? 'grid' : 'hidden sm:grid'} grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-800/80 text-xs`}>
          {/* Category */}
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none min-h-[40px] text-xs"
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none min-h-[40px] text-xs"
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none min-h-[40px] text-xs"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Active (Completed)</option>
            <option value="VOIDED">Voided</option>
            <option value="CORRECTED">Corrected</option>
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => { setSort(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none min-h-[40px] text-xs"
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none font-mono min-h-[40px] text-xs"
            placeholder="From Date"
          />

          {/* End Date */}
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 outline-none font-mono min-h-[40px] text-xs"
            placeholder="To Date"
          />
        </div>

        {activeFiltersCount > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
            <span className="text-slate-400">
              Active filters: <strong className="text-indigo-400">{activeFiltersCount} applied</strong>
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Main Ledger Content: Dual Presentation (Cards on mobile or explicit CARD mode, Table on md+ or explicit TABLE mode) */}
      {loading && transactions.length === 0 ? (
        <GameTableSkeleton
          rows={8}
          cols={6}
          title={user?.role === 'ADMIN' ? 'STREAMING ALL-TRANSACTIONS ARCHIVE' : 'STREAMING MY SHIFT LEDGER'}
          subtitle="Querying receipt numbers, Lagos timestamps, payment methods, and cashier IDs..."
        />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden print-card">
        {/* =========================================================================
            RESPONSIVE CARDS VIEW (Clean & touch-ergonomic on mobile / smaller viewports)
           ========================================================================= */}
        <div className={`${viewMode === 'TABLE' ? 'hidden' : viewMode === 'CARD' ? 'block' : 'block md:hidden'} divide-y divide-slate-800/80 p-3 sm:p-4 space-y-3`}>
          {transactions.map(t => {
            const isVoided = t.status === 'VOIDED';
            const isCorrected = t.status === 'CORRECTED';
            return (
              <div
                key={t.id}
                className={`bg-slate-950 border border-slate-800/90 rounded-2xl p-4 transition space-y-3 ${
                  isVoided ? 'opacity-60 border-rose-950 bg-rose-950/10' : ''
                }`}
              >
                {/* Card Header: Receipt, Timestamp & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm tracking-tight">
                        {t.receiptNumber}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          t.status === 'COMPLETED'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : isVoided
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 line-through'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {t.status}
                      </span>
                      {renderFixFlag(t.id)}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {formatLagosDateTime(t.timestamp)}
                    </div>
                  </div>

                  {/* Amount Pill */}
                  <div className="text-right">
                    <span className={`text-base font-extrabold font-mono ${isVoided ? 'line-through text-slate-500' : 'text-emerald-400'}`}>
                      {formatNaira(t.totalAmountKobo)}
                    </span>
                  </div>
                </div>

                {/* Card Body: Game & Customer details */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span>{t.gameName}</span>
                      {t.items && t.items.length > 1 && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                          {t.items.length} games
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono uppercase">
                      {t.gameCategory.replace('_', ' ')}
                    </span>
                  </div>

                  {t.customerName && (
                    <div className="text-xs text-amber-300 font-medium flex items-center gap-1">
                      <span>👤 Customer: {t.customerName}</span>
                    </div>
                  )}

                  {/* Payment Details */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60 text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-200">
                        {t.paymentMethod === 'BANK_TRANSFER' ? 'Transfer' : t.paymentMethod}
                      </span>
                      {t.senderName && (
                        <span className="text-[11px] text-violet-300">· {t.senderName}</span>
                      )}
                      {t.paymentReference && (
                        <span className="text-[11px] text-indigo-400 font-mono">· {t.paymentReference}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Cashier: <strong className="text-slate-300">{t.cashierName}</strong>
                    </div>
                  </div>
                </div>

                {/* Card Actions: Big touch-friendly buttons */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end gap-2 no-print flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedTxn(t)}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 min-h-[40px] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View / Receipt</span>
                  </button>

                  {user?.role === 'ADMIN' && !isVoided && (
                    <button
                      type="button"
                      onClick={() => {
                        setCorrectModalTxn(t);
                        setCorrectMethod(t.paymentMethod);
                        setCorrectRef(t.paymentReference || '');
                        setCorrectReason('');
                      }}
                      className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 min-h-[40px] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Correct</span>
                    </button>
                  )}

                  {user?.role === 'ADMIN' && !isVoided && (
                    <button
                      type="button"
                      onClick={() => { setVoidModalTxn(t); setVoidReason(''); setVoidCoinsReturned(null); }}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold flex items-center gap-1.5 min-h-[40px] cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Void</span>
                    </button>
                  )}

                  {user?.role === 'CASHIER' && !isVoided && (
                    <button
                      type="button"
                      onClick={() => {
                        setRequestModalTxn(t);
                        setRequestReason('');
                      }}
                      className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 min-h-[40px] cursor-pointer"
                    >
                      <FileQuestion className="w-3.5 h-3.5" />
                      <span>Flag Fix</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {transactions.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              No transactions found matching your criteria.
            </div>
          )}
        </div>

        {/* =========================================================================
            DESKTOP & TABLET DATA GRID (Visible on md+ or when TABLE mode is active)
           ========================================================================= */}
        <div className={`${viewMode === 'CARD' ? 'hidden' : viewMode === 'TABLE' ? 'block' : 'hidden md:block'} overflow-x-auto`}>
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400">
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Receipt No.</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Game</th>
                <th className="py-3 px-4 font-semibold">Method & Slip</th>
                <th className="py-3 px-4 font-semibold text-right whitespace-nowrap">Amount (₦)</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Cashier</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Status</th>
                <th className="py-3 px-4 font-semibold text-right no-print whitespace-nowrap">Actions</th>
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
                    <div className="flex flex-col items-start gap-1">
                      {t.status === 'COMPLETED' ? (
                        <span className="text-emerald-400 text-[11px] font-semibold">Active</span>
                      ) : t.status === 'VOIDED' ? (
                        <span className="text-rose-400 text-[11px] font-semibold">Voided</span>
                      ) : (
                        <span className="text-amber-400 text-[11px] font-semibold">Corrected</span>
                      )}
                      {renderFixFlag(t.id)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right no-print whitespace-nowrap font-sans">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* View details */}
                      <button
                        type="button"
                        onClick={() => setSelectedTxn(t)}
                        title="View details"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Admin: Void action */}
                      {user?.role === 'ADMIN' && t.status !== 'VOIDED' && (
                        <button
                          type="button"
                          onClick={() => { setVoidModalTxn(t); setVoidReason(''); setVoidCoinsReturned(null); }}
                          title="Void transaction"
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer"
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
                          className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 transition min-w-[34px] min-h-[34px] flex items-center justify-center cursor-pointer"
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
                          className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 transition flex items-center gap-1 text-[11px] min-h-[34px] cursor-pointer"
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
        <div className="p-3.5 sm:p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-400 no-print">
          <div>
            Showing <strong className="text-white">{transactions.length}</strong> of <strong className="text-white">{total}</strong> records (Page {page} of {totalPages})
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition flex items-center gap-1 min-h-[36px]"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>
            <span className="font-mono px-2 text-white font-semibold">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition flex items-center gap-1 min-h-[36px]"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTxn && (
        <div onClick={() => setSelectedTxn(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
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
        <div onClick={() => setVoidModalTxn(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
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

              {/* Coin sales: were the physical coins returned to the drawer? */}
              {isCoinTxn(voidModalTxn) && (
                <div className="p-3 rounded-xl bg-amber-950/25 border border-amber-800/50 space-y-2">
                  <label className="block text-xs font-semibold text-amber-200">
                    Were the {coinCountOf(voidModalTxn)} physical coin(s) returned to the drawer?{' '}
                    <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVoidCoinsReturned(true)}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        voidCoinsReturned === true
                          ? 'bg-emerald-600/20 border-emerald-500 text-white font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <RotateCcw className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                      <span className="text-xs">Yes, returned</span>
                      <span className="block text-[10px] text-slate-400 font-normal">
                        Coins go back to the float
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoidCoinsReturned(false)}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        voidCoinsReturned === false
                          ? 'bg-rose-600/20 border-rose-500 text-white font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Ban className="w-4 h-4 mx-auto mb-1 text-rose-400" />
                      <span className="text-xs">No, already out</span>
                      <span className="block text-[10px] text-slate-400 font-normal">
                        Stays deducted (lost)
                      </span>
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-200/80">
                    {voidCoinsReturned === false
                      ? 'The coins were dispensed or are stuck in the machine, so they stay deducted from the cashier float.'
                      : 'The sale is cancelled and the coins are credited back to the cashier float.'}
                  </p>
                </div>
              )}

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
        <div onClick={() => setCorrectModalTxn(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
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
        <div onClick={() => setRequestModalTxn(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
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

      {/* Game-like HUD async operation overlays */}
      {voiding && (
        <GameDataLoadingOverlay
          label="VOIDING FINANCIAL TRANSACTION..."
          sublabel="Applying manager void override, restoring coin float, and auditing..."
        />
      )}
      {correcting && (
        <GameDataLoadingOverlay
          label="CORRECTING TRANSACTION LEDGER..."
          sublabel="Updating payment channel and appending manager audit record..."
        />
      )}
      {requesting && (
        <GameDataLoadingOverlay
          label="DISPATCHING FLAG FIX TICKET..."
          sublabel="Notifying Admin audit queue and tagging transaction..."
        />
      )}
    </div>
  );
}
