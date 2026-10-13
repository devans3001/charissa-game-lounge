import React, { useState, useEffect } from 'react';
import { DashboardStats } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { formatNaira, formatLagosDate, formatLagosTime } from '../lib/utils.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  TrendingUp,
  CreditCard,
  Banknote,
  SendHorizontal,
  CircleDollarSign,
  Gamepad2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Users,
  Trophy,
  ArrowRight,
  Filter,
  Coins
} from 'lucide-react';

interface DashboardViewProps {
  onNavigateToReconciliation?: () => void;
  onNavigateToTransactions?: () => void;
  onNavigateToNewSale?: () => void;
}

export function DashboardView({
  onNavigateToReconciliation,
  onNavigateToTransactions,
  onNavigateToNewSale,
}: DashboardViewProps) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { period };
      if (period === 'custom' && customStart && customEnd) {
        params.startDate = customStart;
        params.endDate = customEnd;
      }
      const res = await api.dashboard.getStats(params);
      setStats(res.stats);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStart && customEnd) {
      fetchStats();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header bar with period switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Financial & Sales Overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time sales ledgers · Nigerian Naira (NGN) · Lagos Timezone
          </p>
        </div>

        {/* Period Switcher (Interactive Segmented Tabs) */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setPeriod('today')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
              period === 'today'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setPeriod('yesterday')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
              period === 'yesterday'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => setPeriod('this_week')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
              period === 'this_week'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setPeriod('this_month')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
              period === 'this_month'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
              period === 'custom'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Custom Range
          </button>
        </div>
      </div>

      {/* Custom Date Form if period === 'custom' */}
      {period === 'custom' && (
        <form
          onSubmit={handleCustomFilterSubmit}
          className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">From:</span>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
              required
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Apply Range
          </button>
        </form>
      )}

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* POS Reconciliation Banner Alert */}
      {user?.role === 'ADMIN' && stats?.reconciliationStatus && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
          stats.reconciliationStatus.status === 'BALANCED'
            ? 'bg-emerald-950/30 border-emerald-800/80 text-emerald-300'
            : stats.reconciliationStatus.status === 'DISCREPANCY_FOUND'
            ? 'bg-amber-950/30 border-amber-800/80 text-amber-300'
            : 'bg-slate-900 border-slate-800 text-slate-300'
        }`}>
          <div className="flex items-center gap-3">
            {stats.reconciliationStatus.status === 'BALANCED' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                Daily POS & Cash Reconciliation Status · {stats.reconciliationStatus.date}
              </div>
              <div className="text-xs opacity-90 mt-0.5">
                Status: <span className="font-semibold">{stats.reconciliationStatus.status}</span>
                {stats.reconciliationStatus.diffTotalKobo !== 0 && (
                  <span> · Net Difference: {formatNaira(stats.reconciliationStatus.diffTotalKobo)}</span>
                )}
              </div>
            </div>
          </div>

          {onNavigateToReconciliation && (
            <button
              type="button"
              onClick={onNavigateToReconciliation}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              Reconcile Day
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Main KPI Revenue Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Recorded Sales</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <CircleDollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {formatNaira(stats?.totalRevenueKobo || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
            <span>{stats?.totalTransactions || 0} transactions</span>
            <span aria-hidden="true">·</span>
            <span>Non-voided</span>
          </div>
        </div>

        {/* Card / POS Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Card / POS Terminal</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-400 font-mono">
            {formatNaira(stats?.posSalesKobo || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {stats?.totalRevenueKobo ? Math.round(((stats.posSalesKobo || 0) / stats.totalRevenueKobo) * 100) : 0}% of total collections
          </div>
        </div>

        {/* Cash Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Physical Cash</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {formatNaira(stats?.cashSalesKobo || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {stats?.totalRevenueKobo ? Math.round(((stats.cashSalesKobo || 0) / stats.totalRevenueKobo) * 100) : 0}% in drawer notes
          </div>
        </div>

        {/* Bank Transfers */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Bank Transfer</span>
            <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
              <SendHorizontal className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-violet-400 font-mono">
            {formatNaira(stats?.transferSalesKobo || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Direct account settlements
          </div>
        </div>
      </div>

      {/* Coin Float Accountability Strip */}
      {stats?.coinStats && (
        <div className="bg-slate-900 border border-amber-800/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              Coin Float Accountability
            </h3>
            {stats.coinStats.totalRemaining < 0 && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Net Shortage
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Allocated</span>
              <span className="text-xl font-bold font-mono text-white">{stats.coinStats.totalAllocated}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Sold</span>
              <span className="text-xl font-bold font-mono text-emerald-400">{stats.coinStats.totalSold}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Lost (voided)</span>
              <span className="text-xl font-bold font-mono text-orange-400">{stats.coinStats.totalVoided}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Compensated</span>
              <span className="text-xl font-bold font-mono text-amber-400">{stats.coinStats.totalCompensated}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">Expected Remaining</span>
              <span className={`text-xl font-bold font-mono ${stats.coinStats.totalRemaining < 0 ? 'text-red-400' : 'text-white'}`}>
                {stats.coinStats.totalRemaining}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Rows: Categories & Games Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales by Category */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4">
            Sales by Game Category
          </h3>
          <div className="space-y-4">
            {stats?.categoryBreakdown.map(cat => {
              const label =
                cat.category === 'PS_GAME'
                  ? 'PlayStation Games'
                  : cat.category === 'SNOOKER'
                  ? 'Snooker Tables'
                  : 'Coin Arcade Games';

              const percent = stats.totalRevenueKobo
                ? Math.round((cat.revenueKobo / stats.totalRevenueKobo) * 100)
                : 0;

              return (
                <div key={cat.category} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-200">{label}</span>
                    <span className="font-mono text-slate-300">{formatNaira(cat.revenueKobo)} ({cat.count})</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        cat.category === 'PS_GAME'
                          ? 'bg-indigo-500'
                          : cat.category === 'SNOOKER'
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Most Played Games */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Most Frequently Played Games
            </h3>
            <span className="text-xs text-slate-400">Ranked by volume & revenue</span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {stats?.gameBreakdown.slice(0, 5).map((game, idx) => (
              <div key={game.gameId} className="py-3 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-slate-400 font-mono font-semibold">{idx + 1}.</span>
                  <div>
                    <span className="font-semibold text-white">{game.gameName}</span>
                    <span className="text-slate-400 ml-2">
                      ({game.category.replace('_', ' ')})
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-bold text-emerald-400 font-mono block">
                    {formatNaira(game.revenueKobo)}
                  </span>
                  <span className="text-slate-400 text-[11px] font-mono">
                    {game.count} plays recorded
                  </span>
                </div>
              </div>
            ))}

            {(!stats?.gameBreakdown || stats.gameBreakdown.length === 0) && (
              <div className="py-6 text-center text-xs text-slate-400">
                No recorded sales in selected period.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cashier Breakdown & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cashier Performance (Only visible to Admin) */}
        {user?.role === 'ADMIN' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Sales by Cashier
              </h3>
              <Users className="w-4 h-4 text-slate-400" />
            </div>

            <div className="space-y-4">
              {stats?.cashierBreakdown.map(c => (
                <div key={c.cashierId} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white text-xs">{c.cashierName}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{c.count} transactions recorded</div>
                  </div>
                  <div className="font-mono font-bold text-emerald-400 text-sm">
                    {formatNaira(c.revenueKobo)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Transactions Feed */}
        <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 ${user?.role === 'ADMIN' ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Live Sales Stream
            </h3>
            {onNavigateToTransactions && (
              <button
                type="button"
                onClick={onNavigateToTransactions}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-semibold"
              >
                View Full Ledger
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Mobile Cards for Live Stream */}
          <div className="sm:hidden space-y-2.5">
            {stats?.recentTransactions.map(t => (
              <div key={t.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-white text-xs">{t.receiptNumber}</span>
                  <span className="font-mono font-bold text-emerald-400 text-xs">
                    {formatNaira(t.totalAmountKobo)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-200">{t.gameName}</span>
                  <span className="text-slate-400 font-mono">{t.paymentMethod}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>Cashier: {t.cashierName}</span>
                  {t.paymentReference && <span className="font-mono text-indigo-400">Ref: {t.paymentReference}</span>}
                </div>
              </div>
            ))}

            {(!stats?.recentTransactions || stats.recentTransactions.length === 0) && (
              <div className="py-8 text-center text-xs text-slate-400">
                No recent sales recorded.
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-semibold whitespace-nowrap">Receipt</th>
                  <th className="pb-2 font-semibold">Game</th>
                  <th className="pb-2 font-semibold">Method</th>
                  <th className="pb-2 font-semibold">Cashier</th>
                  <th className="pb-2 font-semibold text-right whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {stats?.recentTransactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 text-slate-300 font-semibold whitespace-nowrap">{t.receiptNumber}</td>
                    <td className="py-2.5 text-white font-sans">{t.gameName}</td>
                    <td className="py-2.5 text-slate-300">
                      {t.paymentMethod}
                      {t.paymentReference && <span className="text-[10px] text-slate-400 block font-mono">{t.paymentReference}</span>}
                    </td>
                    <td className="py-2.5 text-slate-400 font-sans whitespace-nowrap">{t.cashierName}</td>
                    <td className="py-2.5 text-right font-bold text-emerald-400 whitespace-nowrap">
                      {formatNaira(t.totalAmountKobo)}
                    </td>
                  </tr>
                ))}

                {(!stats?.recentTransactions || stats.recentTransactions.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-400 font-sans">
                      No recent sales recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
