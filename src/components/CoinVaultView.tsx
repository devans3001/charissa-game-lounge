import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CoinAllocation, CoinCompensation, CashierCoinBalance, User, Game } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { queryClient, queryKeys } from '../lib/queryClient.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { formatLagosDateTime } from '../lib/utils.ts';
import {
  Coins,
  PackagePlus,
  Scale,
  Zap,
  AlertTriangle,
  CheckCircle2,
  X,
  History
} from 'lucide-react';
import { GameCardSkeleton, GameTableSkeleton, GameDataLoadingOverlay, GameInlineLoader } from './game-ui/index.ts';

function getTodayLagos(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function CoinVaultView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Allocate modal state
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocCashierId, setAllocCashierId] = useState('');
  const [allocCoins, setAllocCoins] = useState('');
  const [allocNotes, setAllocNotes] = useState('');
  const [submittingAllocate, setSubmittingAllocate] = useState(false);

  // Close/count modal state
  const [closeTarget, setCloseTarget] = useState<CoinAllocation | null>(null);
  const [closeActualCount, setCloseActualCount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [submittingClose, setSubmittingClose] = useState(false);

  // Lost-coin (power outage / machine fault) form state
  const [showCompModal, setShowCompModal] = useState(false);
  const [compCustomerName, setCompCustomerName] = useState('');
  const [compGameId, setCompGameId] = useState('');
  const [compGameName, setCompGameName] = useState('');
  const [compCoins, setCompCoins] = useState('1');
  const [compReason, setCompReason] = useState('');
  const [compNotes, setCompNotes] = useState('');
  const [submittingComp, setSubmittingComp] = useState(false);

  const balancesQuery = useQuery({
    queryKey: queryKeys.coinBalances(),
    queryFn: async () => (await api.coins.balances({})).balances,
    refetchInterval: 12_000,
  });
  const compQuery = useQuery({
    queryKey: queryKeys.coinCompensations(),
    queryFn: async () => (await api.coins.compensations.list({})).compensations,
    refetchInterval: 30_000,
  });
  const gamesQuery = useQuery({
    queryKey: queryKeys.games(false),
    queryFn: () => api.games.list(),
    select: res => (res.games || []).filter(g => g.category === 'COIN_GAME' && g.isActive),
  });
  const allocQuery = useQuery({
    queryKey: queryKeys.coinAllocations(),
    queryFn: async () => (await api.coins.allocations.list({})).allocations,
    enabled: isAdmin,
    refetchInterval: 12_000,
  });
  const cashiersQuery = useQuery({
    queryKey: queryKeys.cashiers(),
    queryFn: async () => ((await api.cashiers.list()).cashiers as unknown as User[]).filter(c => c.isActive),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const balances = balancesQuery.data || [];
  const compensations = compQuery.data || [];
  const coinGames: Game[] = gamesQuery.data || [];
  const allocations: CoinAllocation[] = allocQuery.data || [];
  const cashiers = cashiersQuery.data || [];
  const loading =
    balancesQuery.isLoading ||
    compQuery.isLoading ||
    gamesQuery.isLoading ||
    (isAdmin && (allocQuery.isLoading || cashiersQuery.isLoading));

  useEffect(() => {
    const err =
      balancesQuery.error || compQuery.error || gamesQuery.error || allocQuery.error || cashiersQuery.error;
    if (err) setError((err as any).message || 'Failed to load coin vault data');
  }, [balancesQuery.error, compQuery.error, gamesQuery.error, allocQuery.error, cashiersQuery.error]);

  // When a coin game is picked from the dropdown, prefill its standard coin count
  const handleCompGameSelect = (gameId: string) => {
    setCompGameId(gameId);
    const g = coinGames.find(x => x.id === gameId);
    setCompGameName(g ? g.name : '');
    if (g && g.coinsRequired > 0) setCompCoins(String(g.coinsRequired));
  };

  const openCompModal = () => {
    setCompCustomerName('');
    setCompGameId('');
    setCompGameName('');
    setCompCoins('1');
    setCompReason('');
    setCompNotes('');
    setShowCompModal(true);
  };

  const showToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const allocateMutation = useMutation({
    mutationFn: (vars: { cashierId: string; initialCoins: number; notes?: string }) =>
      api.coins.allocations.create(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coinBalances'] });
      queryClient.invalidateQueries({ queryKey: ['coinAllocations'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to allocate coins'),
  });

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    const coins = parseInt(allocCoins, 10);
    if (!allocCashierId || !Number.isFinite(coins) || coins < 1) {
      setError('Select a cashier and enter a valid number of coins.');
      return;
    }
    try {
      setSubmittingAllocate(true);
      setError(null);
      const res = await allocateMutation.mutateAsync({
        cashierId: allocCashierId,
        initialCoins: coins,
        notes: allocNotes.trim() || undefined,
      });
      showToast(`${coins} coins allocated to ${res.allocation.cashierName}.`);
      setShowAllocateModal(false);
      setAllocCashierId('');
      setAllocCoins('');
      setAllocNotes('');
    } catch {
      // surfaced through onError
    } finally {
      setSubmittingAllocate(false);
    }
  };

  const closeAllocationMutation = useMutation({
    mutationFn: (vars: { allocationId: string; actualRemainingCoins: number; notes?: string }) =>
      api.coins.allocations.close(vars.allocationId, {
        actualRemainingCoins: vars.actualRemainingCoins,
        notes: vars.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coinBalances'] });
      queryClient.invalidateQueries({ queryKey: ['coinAllocations'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to close allocation'),
  });

  const handleCloseAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeTarget) return;
    const actual = parseInt(closeActualCount, 10);
    if (!Number.isFinite(actual) || actual < 0) {
      setError('Enter the physical coin count (0 or more).');
      return;
    }
    try {
      setSubmittingClose(true);
      setError(null);
      const res = await closeAllocationMutation.mutateAsync({
        allocationId: closeTarget.id,
        actualRemainingCoins: actual,
        notes: closeNotes.trim() || undefined,
      });
      const disc = res.discrepancyCoins;
      showToast(
        disc === 0
          ? `Coin float for ${closeTarget.cashierName} is perfectly balanced (${actual} counted).`
          : disc < 0
          ? `SHORTAGE: ${Math.abs(disc)} coin(s) missing for ${closeTarget.cashierName}. Recorded in audit trail.`
          : `OVERAGE: ${disc} extra coin(s) for ${closeTarget.cashierName}. Recorded in audit trail.`
      );
      setCloseTarget(null);
      setCloseActualCount('');
      setCloseNotes('');
    } catch {
      // surfaced through onError
    } finally {
      setSubmittingClose(false);
    }
  };

  const compensationMutation = useMutation({
    mutationFn: (vars: {
      customerName: string;
      gameId: string;
      gameName: string;
      coinsIssued: number;
      reason: string;
      notes?: string;
    }) => api.coins.compensations.create(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coinBalances'] });
      queryClient.invalidateQueries({ queryKey: ['coinCompensations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to record lost coins'),
  });

  const handleCompensation = async (e: React.FormEvent) => {
    e.preventDefault();
    const coins = parseInt(compCoins, 10);
    if (!compCustomerName.trim() || !compGameId || !Number.isFinite(coins) || coins < 1 || !compReason.trim()) {
      setError('Fill in customer name, game, number of coins and what happened.');
      return;
    }
    try {
      setSubmittingComp(true);
      setError(null);
      await compensationMutation.mutateAsync({
        customerName: compCustomerName.trim(),
        gameId: compGameId,
        gameName: compGameName.trim(),
        coinsIssued: coins,
        reason: compReason.trim(),
        notes: compNotes.trim() || undefined,
      });
      showToast(`${coins} lost coin(s) recorded for ${compCustomerName.trim()}. Deducted from the float.`);
      setShowCompModal(false);
      setCompCustomerName('');
      setCompGameId('');
      setCompGameName('');
      setCompCoins('1');
      setCompReason('');
      setCompNotes('');
    } catch {
      // surfaced through onError
    } finally {
      setSubmittingComp(false);
    }
  };

  const todayStr = getTodayLagos();
  const openAllocationsToday = allocations.filter(a => a.status === 'ACTIVE' && a.businessDate === todayStr);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Coins className="w-6 h-6 text-amber-400" />
            {isAdmin ? 'Coin Vault & Float Accountability' : 'My Coin Float'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAdmin
              ? 'Bulk coin allocations to cashiers · sales deductions · power-loss compensation · shortage/theft detection'
              : 'Your allocated coin float for this shift · report lost coins from power outages or machine faults'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAllocateModal(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-sm shadow-amber-600/30"
            >
              <PackagePlus className="w-4 h-4" />
              Allocate Coins
            </button>
          )}
          <button
            type="button"
            onClick={openCompModal}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            Report Lost Coins (Power Outage)
          </button>
        </div>
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
        <div className="space-y-6">
          <GameCardSkeleton count={3} columns="grid-cols-1 md:grid-cols-2 lg:grid-cols-3" />
          <GameTableSkeleton
            rows={5}
            cols={5}
            title="AUDITING PHYSICAL COIN VAULT FLOAT"
            subtitle="Syncing token hoppers, allocations, sales deductions, and lost token logs..."
          />
        </div>
      ) : (
        <>
          {/* BALANCE CARDS */}
          {balances.length === 0 ? (
            <div className="p-10 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 text-sm">
              <Coins className="w-8 h-8 mx-auto mb-3 text-slate-600" />
              {isAdmin
                ? 'No cashier accounts yet. Create a cashier first, then allocate coins to them.'
                : 'No coin float has been allocated to you today. Ask the admin to allocate coins.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {balances.map(b => {
                const isShort = b.expectedRemainingCoins < 0;
                const hasDiscrepancy = b.discrepancyCoins !== undefined && b.discrepancyCoins !== 0;
                const activeAlloc = openAllocationsToday.find(a => a.cashierId === b.cashierId);
                return (
                  <div
                    key={b.cashierId}
                    className={`p-5 rounded-2xl border flex flex-col justify-between ${
                      isShort
                        ? 'bg-red-950/30 border-red-800/70'
                        : hasDiscrepancy
                        ? 'bg-amber-950/20 border-amber-800/60'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                            {b.cashierName.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-white text-sm">{b.cashierName}</h3>
                            <span className="text-[10px] text-slate-500 font-mono">{b.businessDate}</span>
                          </div>
                        </div>
                        {isShort && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Short
                          </span>
                        )}
                      </div>

                      {/* Big expected remaining */}
                      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 mb-3 text-center">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-0.5">
                          Expected Coins in Drawer
                        </span>
                        <span className={`text-3xl font-bold font-mono ${isShort ? 'text-red-400' : 'text-amber-300'}`}>
                          {b.expectedRemainingCoins}
                        </span>
                      </div>

                      {/* Breakdown */}
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Given</span>
                          <span className="font-mono text-slate-200">{b.allocatedCoins}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Sold (coin games)</span>
                          <span className="font-mono text-emerald-400">−{b.soldCoins}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Lost in voided sales</span>
                          <span className="font-mono text-orange-400">−{b.voidedLostCoins ?? 0}</span>
                        </div>
                        {(b.voidedReturnedCoins ?? 0) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Returned via void</span>
                            <span className="font-mono text-emerald-400">+{b.voidedReturnedCoins}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-400">Lost coins</span>
                          <span className="font-mono text-amber-400">−{b.compensatedCoins}</span>
                        </div>

                        {b.actualRemainingCoins !== undefined && (
                          <>
                            <div className="border-t border-slate-800 pt-1.5 mt-1.5 flex justify-between">
                              <span className="text-slate-300 font-semibold">Physically counted</span>
                              <span className="font-mono text-white font-bold">{b.actualRemainingCoins}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-300 font-semibold">Discrepancy</span>
                              <span
                                className={`font-mono font-bold ${
                                  (b.discrepancyCoins || 0) < 0 ? 'text-red-400' : (b.discrepancyCoins || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
                                }`}
                              >
                                {(b.discrepancyCoins || 0) > 0 ? '+' : ''}
                                {b.discrepancyCoins} coin(s)
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {isAdmin && activeAlloc && (
                      <button
                        type="button"
                        onClick={() => { setCloseTarget(activeAlloc); setCloseActualCount(''); setCloseNotes(''); }}
                        className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Scale className="w-3.5 h-3.5 text-indigo-400" />
                        Close Shift & Count Physical Coins
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ADMIN: Allocation history */}
          {isAdmin && allocations.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3 sm:mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-400" />
                Allocation History
              </h3>

              {/* Mobile Cards View */}
              <div className="sm:hidden space-y-2.5">
                {allocations.slice(0, 20).map(a => (
                  <div key={a.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-bold text-white block">{a.cashierName}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{a.businessDate}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-amber-300 font-bold text-sm block">
                          {a.initialCoins} coins
                        </span>
                        <span
                          className={`text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded ${
                            a.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {a.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-800/60 text-slate-400">
                      <span>By: {a.allocatedByName}</span>
                      {a.actualRemainingCoins !== undefined && (
                        <span className={`font-mono font-semibold ${
                          (a.discrepancyCoins || 0) < 0 ? 'text-red-400' : (a.discrepancyCoins || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          Counted: {a.actualRemainingCoins} ({(a.discrepancyCoins || 0) > 0 ? '+' : ''}{a.discrepancyCoins})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[580px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2 font-semibold">Date</th>
                      <th className="pb-2 font-semibold">Cashier</th>
                      <th className="pb-2 font-semibold text-right">Coins</th>
                      <th className="pb-2 font-semibold">Allocated By</th>
                      <th className="pb-2 font-semibold">Status</th>
                      <th className="pb-2 font-semibold text-right">Counted / Diff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {allocations.slice(0, 20).map(a => (
                      <tr key={a.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 text-slate-300 font-mono">{a.businessDate}</td>
                        <td className="py-2.5 text-white font-semibold">{a.cashierName}</td>
                        <td className="py-2.5 text-right font-mono text-amber-300 font-bold">{a.initialCoins}</td>
                        <td className="py-2.5 text-slate-400">{a.allocatedByName}</td>
                        <td className="py-2.5">
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                              a.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono">
                          {a.actualRemainingCoins !== undefined ? (
                            <span className={(a.discrepancyCoins || 0) < 0 ? 'text-red-400 font-bold' : (a.discrepancyCoins || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                              {a.actualRemainingCoins} / {(a.discrepancyCoins || 0) > 0 ? '+' : ''}{a.discrepancyCoins}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lost-coins log */}
          {compensations.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3 sm:mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Power-Outage / Lost Coins Log
              </h3>

              {/* Mobile Cards View */}
              <div className="sm:hidden space-y-2.5">
                {compensations.slice(0, 20).map(c => (
                  <div key={c.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-bold text-white block">{c.customerName}</span>
                        <span className="text-[11px] text-slate-300">{c.gameName}</span>
                      </div>
                      <span className="font-mono text-amber-300 font-bold text-sm">
                        {c.coinsIssued} coins
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 bg-slate-900 p-2 rounded-lg font-sans">
                      "{c.reason}"
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/60">
                      <span>Cashier: {c.cashierName}</span>
                      <span>{formatLagosDateTime(c.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[580px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2 font-semibold whitespace-nowrap">When</th>
                      <th className="pb-2 font-semibold">Cashier</th>
                      <th className="pb-2 font-semibold">Customer</th>
                      <th className="pb-2 font-semibold">Game</th>
                      <th className="pb-2 font-semibold text-right">Coins</th>
                      <th className="pb-2 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {compensations.slice(0, 20).map(c => (
                      <tr key={c.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 text-slate-400 font-mono whitespace-nowrap">{formatLagosDateTime(c.timestamp)}</td>
                        <td className="py-2.5 text-white font-semibold whitespace-nowrap">{c.cashierName}</td>
                        <td className="py-2.5 text-slate-200">{c.customerName}</td>
                        <td className="py-2.5 text-slate-300">{c.gameName}</td>
                        <td className="py-2.5 text-right font-mono text-amber-300 font-bold">{c.coinsIssued}</td>
                        <td className="py-2.5 text-slate-400 max-w-[280px] truncate" title={c.reason}>{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ ALLOCATE MODAL (ADMIN) ============ */}
      {showAllocateModal && (
        <div onClick={() => setShowAllocateModal(false)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button type="button" onClick={() => setShowAllocateModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-amber-400" />
              Allocate Bulk Coins to Cashier
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Hand physical coins to a cashier. Every coin-game sale they record deducts from this float automatically.
            </p>
            <form onSubmit={handleAllocate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Cashier *</label>
                <select
                  required
                  value={allocCashierId}
                  onChange={e => setAllocCashierId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 outline-none"
                >
                  <option value="">— Select cashier —</option>
                  {cashiers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Number of Coins *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={allocCoins}
                  onChange={e => setAllocCoins(e.target.value)}
                  placeholder="e.g. 200"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={allocNotes}
                  onChange={e => setAllocNotes(e.target.value)}
                  placeholder="e.g. Morning shift float"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submittingAllocate}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {submittingAllocate ? 'Allocating...' : 'Confirm Allocation'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============ CLOSE & COUNT MODAL (ADMIN) ============ */}
      {closeTarget && (
        <div onClick={() => setCloseTarget(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button type="button" onClick={() => setCloseTarget(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-400" />
              Physical Coin Count — {closeTarget.cashierName}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Count the coins actually remaining in the drawer. Any shortage is flagged as possible theft, loss or miscount and permanently recorded in the audit trail.
            </p>
            <form onSubmit={handleCloseAllocation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Coins Physically Counted *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={closeActualCount}
                  onChange={e => setCloseActualCount(e.target.value)}
                  placeholder="e.g. 187"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  placeholder="e.g. End of night shift"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submittingClose}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {submittingClose ? 'Recording...' : 'Confirm Count & Close Float'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============ LOST-COIN MODAL (POWER OUTAGE / MACHINE FAULT) ============ */}
      {showCompModal && (
        <div onClick={() => setShowCompModal(false)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button type="button" onClick={() => setShowCompModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Report Lost Coins
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Use this when power goes out mid-game (or a machine fault swallows the coin). The lost coins you re-issue to the customer are deducted from the float so the books balance.
            </p>
            <form onSubmit={handleCompensation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={compCustomerName}
                  onChange={e => setCompCustomerName(e.target.value)}
                  placeholder="e.g. Emeka Okonkwo"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Game *</label>
                  <select
                    required
                    value={compGameId}
                    onChange={e => handleCompGameSelect(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 outline-none"
                  >
                    <option value="">-- Select coin game --</option>
                    {coinGames.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.coinsRequired} coins)</option>
                    ))}
                  </select>
                  {coinGames.length === 0 && (
                    <p className="text-[11px] text-rose-400 mt-1">No active coin games found. Ask an admin to add one in Games &amp; Pricing.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Lost Coins *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={50}
                    value={compCoins}
                    onChange={e => setCompCoins(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:border-amber-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">What Happened? *</label>
                <input
                  type="text"
                  required
                  value={compReason}
                  onChange={e => setCompReason(e.target.value)}
                  placeholder='e.g. "Power outage mid-game, coin lost in machine"'
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Extra Notes (optional)</label>
                <input
                  type="text"
                  value={compNotes}
                  onChange={e => setCompNotes(e.target.value)}
                  placeholder="e.g. Lights came back after 20 mins, customer replayed"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submittingComp}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {submittingComp ? 'Recording...' : 'Record Lost Coins & Deduct from Float'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Game-like HUD async operation overlays */}
      {submittingAllocate && (
        <GameDataLoadingOverlay
          label="DISPENSING FLOAT COINS TO CASHIER..."
          sublabel="Incrementing cashier drawer balance and logging manager allocation..."
        />
      )}
      {submittingClose && (
        <GameDataLoadingOverlay
          label="AUDITING SHIFT COIN RECONCILIATION..."
          sublabel="Calculating physical vs expected coin variance and locking float..."
        />
      )}
      {submittingComp && (
        <GameDataLoadingOverlay
          label="RECORDING LOST COIN INCIDENT..."
          sublabel="Auditing machine outage coin replacement and updating drawer balance..."
        />
      )}
    </div>
  );
}
