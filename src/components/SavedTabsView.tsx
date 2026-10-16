import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CustomerTab, PaymentMethod, Transaction } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { queryClient, queryKeys } from '../lib/queryClient.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { formatNaira, formatLagosDateTime } from '../lib/utils.ts';
import {
  BookmarkCheck,
  Search,
  CheckCircle2,
  Clock,
  User,
  Gamepad2,
  CreditCard,
  Banknote,
  SendHorizontal,
  Trash2,
  Printer,
  X,
  AlertCircle,
  Copy,
  Clock3,
  Calendar,
  RotateCcw,
  Check,
  Coins,
  Receipt
} from 'lucide-react';
import { GameCardSkeleton, GameTableSkeleton, GameInlineLoader, GameDataLoadingOverlay } from './game-ui/index.ts';

export function SavedTabsView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'CLOSED' | 'ALL'>('OPEN');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [selectedTabForCheckout, setSelectedTabForCheckout] = useState<CustomerTab | null>(null);
  const [selectedTabForDelete, setSelectedTabForDelete] = useState<CustomerTab | null>(null);
  const [selectedTabToView, setSelectedTabToView] = useState<CustomerTab | null>(null);
  const [completedTxn, setCompletedTxn] = useState<Transaction | null>(null);

  // Checkout form
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('');
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Queries
  const tabsQuery = useQuery({
    queryKey: queryKeys.customerTabs(),
    queryFn: async () => (await api.tabs.list()).tabs,
    refetchInterval: 8_000,
  });

  const bankAccountsQuery = useQuery({
    queryKey: queryKeys.bankAccounts(),
    queryFn: () => api.bankAccounts.list(),
    select: res => res.accounts.filter(a => a.isActive !== false),
  });
  const bankAccounts = bankAccountsQuery.data || [];

  const allTabs = tabsQuery.data || [];
  const loading = tabsQuery.isLoading;

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: (vars: { tabId: string; paymentMethod: PaymentMethod; paymentReference?: string; senderName?: string }) =>
      api.tabs.checkout(vars.tabId, {
        paymentMethod: vars.paymentMethod,
        paymentReference: vars.paymentReference,
        senderName: vars.senderName,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customerTabs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['coinBalances'] });
      queryClient.invalidateQueries({ queryKey: ['shiftStats'] });

      setSelectedTabForCheckout(null);
      setCompletedTxn(res.transaction);
      showToast(`Tab #${res.tab.tabNumber} successfully settled & closed (${formatNaira(res.tab.totalAmountKobo)}).`);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to complete tab checkout');
    },
  });

  // Delete / Cancel mutation
  const deleteMutation = useMutation({
    mutationFn: (tabId: string) => api.tabs.delete(tabId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerTabs'] });
      setSelectedTabForDelete(null);
      showToast('Customer tab was cancelled and removed.');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to cancel tab');
    },
  });

  const handleConfirmCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTabForCheckout) return;
    setError(null);

    if (payMethod === 'POS' && !paymentRef.trim()) {
      setError('Please provide the POS Terminal Reference or Approval code.');
      return;
    }
    if (payMethod === 'BANK_TRANSFER' && !senderName.trim()) {
      setError('Please enter the customer sender bank account name for verification.');
      return;
    }

    checkoutMutation.mutate({
      tabId: selectedTabForCheckout.id,
      paymentMethod: payMethod,
      paymentReference: paymentRef.trim() || undefined,
      senderName: payMethod === 'BANK_TRANSFER' ? senderName.trim() : undefined,
    });
  };

  const handleCopyAccount = (num: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(num);
      showToast(`Copied account ${num}`);
    }
  };

  // Compute metrics
  const openTabs = allTabs.filter(t => t.status === 'OPEN');
  const totalUnpaidKobo = openTabs.reduce((s, t) => s + (t.totalAmountKobo || 0), 0);
  const activeStations = new Set(openTabs.map(t => t.stationOrNote).filter(Boolean)).size;

  // Filter tabs
  const filteredTabs = allTabs.filter(t => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = t.customerName?.toLowerCase().includes(q);
      const matchNum = t.tabNumber?.toLowerCase().includes(q);
      const matchStation = t.stationOrNote?.toLowerCase().includes(q);
      const matchPhone = t.phoneNumber?.includes(q);
      const matchCashier = t.cashierName?.toLowerCase().includes(q);
      const matchItems = t.items?.some(it => it.gameName.toLowerCase().includes(q));
      return matchName || matchNum || matchStation || matchPhone || matchCashier || matchItems;
    }
    return true;
  });

  // Calculate elapsed time from ISO timestamp
  const getElapsedTime = (isoDate: string) => {
    try {
      const diffMs = Date.now() - new Date(isoDate).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours}h ${remMins}m ago`;
    } catch {
      return '';
    }
  };

  const isStale = (isoDate: string) => {
    try {
      const diffMs = Date.now() - new Date(isoDate).getTime();
      return diffMs > 2 * 60 * 60 * 1000; // > 2 hours
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookmarkCheck className="w-6 h-6 text-indigo-400" />
            Customer Open Tabs Management
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time tracking of unpaid player sessions and open customer tabs across all cashier counters
          </p>
        </div>

        <div className="flex items-center gap-3">
          {tabsQuery.isFetching && (
            <div className="px-2.5 py-1 bg-indigo-950/60 border border-indigo-900/60 rounded-lg text-indigo-300">
              <GameInlineLoader label="SYNCING TABS..." variant="pulse" />
            </div>
          )}
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            Open: <strong className="text-emerald-400">{openTabs.length}</strong> · Unpaid: <strong className="text-amber-300">{formatNaira(totalUnpaidKobo)}</strong>
          </span>
        </div>
      </div>

      {toastMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Open Unpaid Tabs</span>
            <BookmarkCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">{openTabs.length}</div>
          <div className="text-[11px] text-slate-400">Currently active sessions</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Uncollected Balance</span>
            <Coins className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono">{formatNaira(totalUnpaidKobo)}</div>
          <div className="text-[11px] text-slate-400">Pending customer payment</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Occupied Stations</span>
            <Gamepad2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-purple-300 font-mono">{activeStations}</div>
          <div className="text-[11px] text-slate-400">Tagged station identifiers</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Oldest Active Tab</span>
            <Clock3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-300 font-mono truncate">
            {openTabs.length > 0 ? getElapsedTime(openTabs[openTabs.length - 1].createdAt) : 'None'}
          </div>
          <div className="text-[11px] text-slate-400">
            {openTabs.some(t => isStale(t.createdAt)) ? (
              <span className="text-rose-400 font-semibold">⚠️ Attention: tab open &gt; 2 hours</span>
            ) : (
              'All tabs within normal range'
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, tab #, station/note, cashier, or game..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setStatusFilter('OPEN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'OPEN'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Open ({openTabs.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('CLOSED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'CLOSED'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Closed / Settled
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Tabs ({allTabs.length})
          </button>
        </div>
      </div>

      {/* Main Tabs Container */}
      {loading && allTabs.length === 0 ? (
        <GameTableSkeleton
          rows={6}
          cols={5}
          title="STREAMING OPEN CUSTOMER TABS"
          subtitle="Querying real-time player counters, unpaid carts, and lounge station allocations..."
        />
      ) : filteredTabs.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <BookmarkCheck className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No Customer Tabs Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? 'No customer tabs match your current search criteria. Try a different query.'
              : statusFilter === 'OPEN'
              ? 'All open customer tabs have been closed and paid. Cashiers can open new customer tabs from the Terminal POS.'
              : 'No tabs in this view.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mobile Cards View */}
          <div className="sm:hidden space-y-3">
            {filteredTabs.map(tab => {
              const stale = tab.status === 'OPEN' && isStale(tab.createdAt);
              return (
                <div
                  key={tab.id}
                  className={`p-4 rounded-2xl border transition space-y-3 ${
                    stale
                      ? 'bg-amber-950/20 border-amber-800/80'
                      : tab.status === 'OPEN'
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-slate-950/60 border-slate-800/60 opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm">
                          #{tab.tabNumber}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                            tab.status === 'OPEN'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {tab.status}
                        </span>
                        {stale && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded">
                            Long Session
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-slate-200 text-sm mt-1">{tab.customerName}</div>
                      {tab.stationOrNote && (
                        <div className="text-xs text-indigo-300 font-medium">🎮 {tab.stationOrNote}</div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-extrabold text-base text-emerald-400">
                        {formatNaira(tab.totalAmountKobo)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {getElapsedTime(tab.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Items list preview */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 space-y-1 text-xs">
                    {tab.items?.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-300">
                          {it.gameName} <span className="text-slate-500">x{it.quantity}</span>
                        </span>
                        <span className="font-mono text-slate-400">{formatNaira(it.totalAmountKobo)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>Cashier: <strong className="text-slate-200">{tab.cashierName}</strong></span>
                    {tab.phoneNumber && <span>📞 {tab.phoneNumber}</span>}
                  </div>

                  {/* Mobile Actions */}
                  {tab.status === 'OPEN' && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTabForCheckout(tab);
                          setPayMethod('CASH');
                          setPaymentRef('');
                          setSenderName('');
                          setError(null);
                        }}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Collect Payment
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setSelectedTabForDelete(tab)}
                          className="p-2 border border-rose-900/60 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 rounded-xl transition cursor-pointer"
                          title="Cancel/Delete Stale Tab"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead>
                <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400">
                  <th className="py-3.5 px-4 font-semibold">Tab #</th>
                  <th className="py-3.5 px-4 font-semibold">Customer & Station</th>
                  <th className="py-3.5 px-4 font-semibold">Games Breakdown</th>
                  <th className="py-3.5 px-4 font-semibold">Opened</th>
                  <th className="py-3.5 px-4 font-semibold">Cashier</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Total Unpaid</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredTabs.map(tab => {
                  const stale = tab.status === 'OPEN' && isStale(tab.createdAt);
                  return (
                    <tr key={tab.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 whitespace-nowrap font-mono">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">#{tab.tabNumber}</span>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              tab.status === 'OPEN'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {tab.status}
                          </span>
                        </div>
                        {stale && (
                          <span className="text-[9px] text-amber-400 block mt-0.5 font-sans font-semibold">
                            ⚠️ Stale (&gt;2 hrs)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{tab.customerName}</div>
                        {tab.stationOrNote && (
                          <div className="text-[11px] text-indigo-300 font-medium">
                            🎮 {tab.stationOrNote}
                          </div>
                        )}
                        {tab.phoneNumber && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            📞 {tab.phoneNumber}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="space-y-0.5">
                          {tab.items?.map((it, idx) => (
                            <div key={idx} className="text-[11px] text-slate-300 flex items-center justify-between">
                              <span className="truncate pr-2">
                                {it.gameName} <span className="text-slate-500 font-mono">x{it.quantity}</span>
                              </span>
                              <span className="font-mono text-slate-400 shrink-0">
                                {formatNaira(it.totalAmountKobo)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-slate-300 font-mono text-[11px]">
                          {formatLagosDateTime(tab.createdAt)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {getElapsedTime(tab.createdAt)}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-300">
                        {tab.cashierName}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-emerald-400 text-sm">
                        {formatNaira(tab.totalAmountKobo)}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {tab.status === 'OPEN' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTabForCheckout(tab);
                                setPayMethod('CASH');
                                setPaymentRef('');
                                setSenderName('');
                                setError(null);
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-sm shadow-emerald-600/20"
                              title="Collect Payment and Close Tab"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Checkout Tab
                            </button>

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setSelectedTabForDelete(tab)}
                                className="p-1.5 rounded-lg border border-rose-900/60 bg-rose-950/30 text-rose-300 hover:bg-rose-900/60 transition cursor-pointer"
                                title="Cancel and Delete Unpaid Tab"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">
                            Settled {tab.closedAt ? formatLagosDateTime(tab.closedAt) : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Collect Payment / Checkout Modal */}
      {selectedTabForCheckout && (
        <div
          onClick={() => setSelectedTabForCheckout(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setSelectedTabForCheckout(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Close & Checkout Tab #{selectedTabForCheckout.tabNumber}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedTabForCheckout.customerName} {selectedTabForCheckout.stationOrNote ? `· ${selectedTabForCheckout.stationOrNote}` : ''}
                </p>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 mb-4 text-xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase">Itemized Bill</div>
              {selectedTabForCheckout.items?.map((it, idx) => (
                <div key={idx} className="flex justify-between text-slate-300">
                  <span>{it.gameName} x{it.quantity}</span>
                  <span className="font-mono">{formatNaira(it.totalAmountKobo)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline font-bold">
                <span className="text-slate-300">Total Unpaid:</span>
                <span className="text-emerald-400 font-mono text-base">
                  {formatNaira(selectedTabForCheckout.totalAmountKobo)}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmCheckout} className="space-y-4">
              {/* Payment Method selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Payment Method *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMethod('CASH')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      payMethod === 'CASH'
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('POS')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      payMethod === 'POS'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    POS Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('BANK_TRANSFER')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      payMethod === 'BANK_TRANSFER'
                        ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <SendHorizontal className="w-3.5 h-3.5" />
                    Transfer
                  </button>
                </div>
              </div>

              {payMethod === 'POS' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    POS Slip Reference / Approval Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={paymentRef}
                    onChange={e => setPaymentRef(e.target.value)}
                    placeholder="e.g. MONIEPOINT-492019 / RRN 90281"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none font-mono"
                  />
                </div>
              )}

              {payMethod === 'BANK_TRANSFER' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Customer Bank Account Name (Sender) *
                    </label>
                    <input
                      type="text"
                      required
                      value={senderName}
                      onChange={e => setSenderName(e.target.value)}
                      placeholder="e.g. Chinedu Eze / Kuda Bank"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500 outline-none"
                    />
                  </div>

                  {bankAccounts.length > 0 && (
                    <div className="p-3 bg-purple-950/20 border border-purple-900/40 rounded-xl space-y-1.5 text-xs">
                      <div className="text-[10px] uppercase font-bold text-purple-300">
                        Lounge Reception Transfer Accounts:
                      </div>
                      {bankAccounts.map(b => (
                        <div key={b.id} className="flex justify-between items-center text-[11px]">
                          <span>{b.bankName}: <strong className="text-white font-mono">{b.accountNumber}</strong></span>
                          <button
                            type="button"
                            onClick={() => handleCopyAccount(b.accountNumber)}
                            className="p-1 hover:text-white text-purple-300"
                            title="Copy Account Number"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedTabForCheckout(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={checkoutMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {checkoutMutation.isPending ? 'Processing...' : 'Confirm Payment & Close'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Cancel Tab Modal */}
      {selectedTabForDelete && (
        <div
          onClick={() => setSelectedTabForDelete(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setSelectedTabForDelete(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Cancel Stale Tab #{selectedTabForDelete.tabNumber}?</h3>
                <p className="text-xs text-slate-400">Customer: {selectedTabForDelete.customerName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950 p-3.5 rounded-xl border border-slate-800 mb-6 leading-relaxed">
              Are you sure you want to cancel this unpaid tab for <strong className="text-white">{formatNaira(selectedTabForDelete.totalAmountKobo)}</strong>? The session will be voided and marked as cancelled.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedTabForDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(selectedTabForDelete.id)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                {deleteMutation.isPending ? 'Cancelling...' : 'Yes, Cancel Tab'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Receipt Modal */}
      {completedTxn && (
        <div
          onClick={() => setCompletedTxn(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 text-slate-100 shadow-2xl relative print:border-none print:shadow-none print:text-black print:bg-white"
          >
            <div className="text-center pb-4 border-b border-slate-800 print:border-black">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center mb-2 no-print">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white print:text-black">Payment Receipt</h3>
              <p className="text-xs text-slate-400 font-mono print:text-black">{completedTxn.receiptNumber}</p>
            </div>

            <div className="py-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-black">Customer:</span>
                <span className="font-bold text-white print:text-black">{completedTxn.customerName || 'Guest'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-black">Date & Time:</span>
                <span>{formatLagosDateTime(completedTxn.timestamp)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-black">Payment Method:</span>
                <span className="text-indigo-400 font-bold print:text-black">{completedTxn.paymentMethod}</span>
              </div>
              {completedTxn.paymentReference && (
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-black">Ref:</span>
                  <span>{completedTxn.paymentReference}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-800 print:border-black flex justify-between items-baseline font-bold text-sm">
                <span>Total Settled:</span>
                <span className="text-emerald-400 font-extrabold print:text-black">
                  {formatNaira(completedTxn.totalAmountKobo)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Slip
              </button>
              <button
                type="button"
                onClick={() => setCompletedTxn(null)}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutMutation.isPending && (
        <GameDataLoadingOverlay
          label="FINALIZING TAB CHECKOUT..."
          sublabel="Recording official transaction, adjusting cash registers, and closing customer session..."
        />
      )}
    </div>
  );
}
