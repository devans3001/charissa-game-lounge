import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Game, GameCategory, AppSettings } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { queryClient, queryKeys } from '../lib/queryClient.ts';
import { formatNaira, nairaToKobo, koboToNaira } from '../lib/utils.ts';
import {
  Gamepad2,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Coins,
  CircleDot,
  CheckCircle2,
  X,
  History,
  Info
} from 'lucide-react';
import { GameCatalogSkeleton, GameDataLoadingOverlay, GameInlineLoader } from './game-ui/index.ts';

export function GameManagementView() {
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);

  // Global coin price (one price for ALL coin games) — derived from the settings query below
  const [coinPriceInput, setCoinPriceInput] = useState('500');
  const [savingCoinPrice, setSavingCoinPrice] = useState(false);

  // Form states for Add/Edit
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<GameCategory>('PS_GAME');
  const [formDescription, setFormDescription] = useState('');
  const [formStandardPriceNaira, setFormStandardPriceNaira] = useState('1500');
  const [formCoinsRequired, setFormCoinsRequired] = useState('4');
  const [saving, setSaving] = useState(false);

  const gamesQuery = useQuery({
    queryKey: queryKeys.games(true), // all = true for admin
    queryFn: () => api.games.list(true),
    refetchInterval: 30_000,
  });
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => api.settings.get(),
    refetchInterval: 30_000,
  });

  const games = gamesQuery.data?.games || [];
  const loading = gamesQuery.isLoading || settingsQuery.isLoading;
  const coinPrice: AppSettings | null = settingsQuery.data?.settings ?? null;

  useEffect(() => {
    const err = gamesQuery.error || settingsQuery.error;
    if (err) setError((err as any).message || 'Failed to load games catalog');
  }, [gamesQuery.error, settingsQuery.error]);

  // Seed the price input once so focus refetches never clobber in-progress typing
  const priceInputInitRef = useRef(false);
  useEffect(() => {
    if (!settingsQuery.data || priceInputInitRef.current) return;
    priceInputInitRef.current = true;
    setCoinPriceInput(koboToNaira(settingsQuery.data.settings.coinPriceKobo).toString());
  }, [settingsQuery.data]);

  const saveCoinPriceMutation = useMutation({
    mutationFn: (kobo: number) => api.settings.updateCoinPrice(kobo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['coinPrice'] });
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to update coin price'),
  });

  const handleSaveCoinPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const kobo = nairaToKobo(coinPriceInput);
    if (!Number.isFinite(kobo) || kobo <= 0) {
      setError('Enter a valid coin price greater than zero.');
      return;
    }
    try {
      setSavingCoinPrice(true);
      setError(null);
      const res = await saveCoinPriceMutation.mutateAsync(kobo);
      setCoinPriceInput(koboToNaira(res.settings.coinPriceKobo).toString());
      setSuccessMessage(`Global coin price updated to ${formatNaira(res.settings.coinPriceKobo)} — all coin games re-priced instantly.`);
    } catch {
      // surfaced through onError
    } finally {
      setSavingCoinPrice(false);
    }
  };

  const openAddModal = () => {
    setFormName('');
    setFormCategory('PS_GAME');
    setFormDescription('');
    setFormStandardPriceNaira('1500');
    setFormCoinsRequired('4');
    setShowAddModal(true);
  };

  const openEditModal = (game: Game) => {
    setEditingGame(game);
    setFormName(game.name);
    setFormCategory(game.category);
    setFormDescription(game.description || '');
    setFormStandardPriceNaira(koboToNaira(game.standardPriceKobo).toString());
    setFormCoinsRequired(game.coinsRequired.toString());
  };

  const toggleStatusMutation = useMutation({
    mutationFn: (vars: { gameId: string; makeActive: boolean }) =>
      api.games.toggleStatus(vars.gameId, vars.makeActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['games'] }),
    onError: (err: any) => setError(err.message || 'Failed to toggle status'),
  });

  const handleToggleStatus = async (game: Game) => {
    setError(null);
    try {
      await toggleStatusMutation.mutateAsync({ gameId: game.id, makeActive: !game.isActive });
      setSuccessMessage(
        `Game "${game.name}" was ${!game.isActive ? 'activated' : 'deactivated'}. Historical records remain preserved.`
      );
    } catch {
      // surfaced through onError
    }
  };

  const saveGameMutation = useMutation({
    mutationFn: (vars: {
      gameId?: string;
      name: string;
      category: GameCategory;
      description: string;
      standardPriceKobo: number;
      coinsRequired: number;
    }) => {
      const body = {
        name: vars.name,
        category: vars.category,
        description: vars.description,
        standardPriceKobo: vars.standardPriceKobo,
        coinsRequired: vars.coinsRequired,
      };
      return vars.gameId ? api.games.update(vars.gameId, body) : api.games.create(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (err: any) => setError(err.message || 'Failed to save game'),
  });

  const handleSaveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Game name is required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const standardPriceKobo = nairaToKobo(formStandardPriceNaira);
      const coinsRequired = parseInt(formCoinsRequired, 10) || 1;

      await saveGameMutation.mutateAsync({
        gameId: editingGame?.id,
        name: formName.trim(),
        category: formCategory,
        description: formDescription.trim(),
        standardPriceKobo,
        coinsRequired,
      });

      if (editingGame) {
        setSuccessMessage(`Game "${formName}" pricing and configuration updated successfully.`);
        setEditingGame(null);
      } else {
        setSuccessMessage(`New game "${formName}" added to catalog.`);
        setShowAddModal(false);
      }
    } catch {
      // surfaced through onError
    } finally {
      setSaving(false);
    }
  };

  // Preview calculated price
  const previewCoins = parseInt(formCoinsRequired, 10) || 1;
  const globalCoinPriceKobo = coinPrice ? coinPrice.coinPriceKobo : nairaToKobo('500');
  const calculatedCoinPriceKobo = previewCoins * globalCoinPriceKobo;
  const calculatedPreviewPriceKobo =
    formCategory === 'COIN_GAME' ? calculatedCoinPriceKobo : nairaToKobo(formStandardPriceNaira);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-indigo-400" />
            Game Catalog & Pricing Management
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure PS games, Snooker frame rates, and coin requirements per arcade play
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add New Game
        </button>
      </div>

      {/* Global Coin Price — one price applied to ALL coin games */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Global Coin Price</span>
          <p className="text-xs text-slate-300 mt-0.5">
            One price for every coin game. Applied live to all future coin sales and to the
            calculated price card below.
          </p>
        </div>

        <form onSubmit={handleSaveCoinPrice} className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">&#8358;</span>
            <input
              type="number"
              min="0"
              step="10"
              value={coinPriceInput}
              onChange={e => setCoinPriceInput(e.target.value)}
              className="w-full sm:w-44 bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-3 py-2 text-xs text-white font-mono focus:border-indigo-500 outline-none shadow-sm"
              placeholder="500"
            />
          </div>
          <button
            type="submit"
            disabled={savingCoinPrice}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
          >
            {savingCoinPrice ? 'Updating...' : 'Apply Global Price'}
          </button>
        </form>
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

      {/* Info Notice about Pricing Immutability */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Immutable Ledger Guarantee: </span>
          When you update a game's price or coins per play, the new price strictly applies to new future transactions. All past transactions retain their original recorded price snapshot and financial integrity.
        </div>
      </div>

      {/* Games Catalog Grid */}
      {loading && games.length === 0 ? (
        <GameCatalogSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map(game => (
          <div
            key={game.id}
            className={`p-5 rounded-2xl border transition flex flex-col justify-between ${
              game.isActive
                ? 'bg-slate-900 border-slate-800'
                : 'bg-slate-950/80 border-slate-800/60 opacity-60'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="font-bold text-white text-sm">{game.name}</h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {game.category === 'PS_GAME'
                      ? 'PlayStation'
                      : game.category === 'SNOOKER'
                      ? 'Snooker Table'
                      : 'Coin Arcade'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                    game.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {game.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {game.description && (
                <p className="text-xs text-slate-400 mb-4">{game.description}</p>
              )}

              {/* Pricing details */}
              <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl my-3 space-y-1">
                {game.category === 'COIN_GAME' ? (
                  <>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Required Coins:</span>
                      <span className="font-mono text-amber-300">{game.coinsRequired} coins</span>
                    </div>
                    <div className="border-t border-slate-800 pt-1.5 flex justify-between items-baseline text-xs">
                      <span className="font-semibold text-slate-300">Play Price (Coins × Global Rate):</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {formatNaira(game.coinsRequired * globalCoinPriceKobo)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="font-semibold text-slate-300">Standard Play Price:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {formatNaira(game.calculatedPriceKobo)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleToggleStatus(game)}
                className={`text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  game.isActive ? 'text-slate-400 hover:text-rose-400' : 'text-emerald-400 hover:text-emerald-300'
                }`}
              >
                {game.isActive ? (
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
                onClick={() => openEditModal(game)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit / Reprice
              </button>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Add / Edit Game Modal */}
      {(showAddModal || editingGame) && (
        <div onClick={() => { setShowAddModal(false); setEditingGame(null); }} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              type="button"
              onClick={() => { setShowAddModal(false); setEditingGame(null); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">
              {editingGame ? `Edit "${editingGame.name}"` : 'Add New Game'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Configure game parameters and price calculation rules
            </p>

            <form onSubmit={handleSaveGame} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Game Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. FIFA 25 or Car Racing Deluxe"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                />
              </div>

              {!editingGame && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category *</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as GameCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="PS_GAME">PlayStation Game (PS Games)</option>
                    <option value="SNOOKER">Snooker Table (Standalone Category)</option>
                    <option value="COIN_GAME">Coin Game (Coins × Price per Coin)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="e.g. DualShock 5 multiplayer cabinet"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                />
              </div>

              {/* Price configuration */}
              {formCategory === 'COIN_GAME' ? (
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                    Coin Game Pricing Math
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Coins Required</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={formCoinsRequired}
                        onChange={e => setFormCoinsRequired(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-2 flex justify-between items-baseline text-xs">
                    <span className="text-slate-400">Calculated Charge per Play:</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {formatNaira(calculatedCoinPriceKobo)}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Standard Play Price (₦) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formStandardPriceNaira}
                    onChange={e => setFormStandardPriceNaira(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:border-indigo-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Effective: {formatNaira(nairaToKobo(formStandardPriceNaira))}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingGame(null); }}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {saving ? 'Saving...' : editingGame ? 'Save Changes' : 'Create Game'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Game-like HUD async operation overlays */}
      {saving && (
        <GameDataLoadingOverlay
          label="COMMITTING GAME CATALOG PARAMETERS..."
          sublabel="Applying immutable pricing snapshots and updating lounge terminal rates..."
        />
      )}
      {savingCoinPrice && (
        <GameDataLoadingOverlay
          label="SYNCHRONIZING GLOBAL COIN RATE..."
          sublabel="Recalculating Naira per play across all coin machines..."
        />
      )}
    </div>
  );
}
