import React, { useState, useEffect } from 'react';
import { Game, GameCategory } from '../types/index.ts';
import { api } from '../lib/api.ts';
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

export function GameManagementView() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);

  // Form states for Add/Edit
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<GameCategory>('PS_GAME');
  const [formDescription, setFormDescription] = useState('');
  const [formStandardPriceNaira, setFormStandardPriceNaira] = useState('1500');
  const [formCoinsRequired, setFormCoinsRequired] = useState('4');
  const [formPricePerCoinNaira, setFormPricePerCoinNaira] = useState('500');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.games.list(true); // all = true for admin
      setGames(res.games);
    } catch (err: any) {
      setError(err.message || 'Failed to load games catalog');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setFormName('');
    setFormCategory('PS_GAME');
    setFormDescription('');
    setFormStandardPriceNaira('1500');
    setFormCoinsRequired('4');
    setFormPricePerCoinNaira('500');
    setShowAddModal(true);
  };

  const openEditModal = (game: Game) => {
    setEditingGame(game);
    setFormName(game.name);
    setFormCategory(game.category);
    setFormDescription(game.description || '');
    setFormStandardPriceNaira(koboToNaira(game.standardPriceKobo).toString());
    setFormCoinsRequired(game.coinsRequired.toString());
    setFormPricePerCoinNaira(koboToNaira(game.pricePerCoinKobo).toString());
  };

  const handleToggleStatus = async (game: Game) => {
    try {
      setError(null);
      await api.games.toggleStatus(game.id, !game.isActive);
      setSuccessMessage(
        `Game "${game.name}" was ${!game.isActive ? 'activated' : 'deactivated'}. Historical records remain preserved.`
      );
      loadGames();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle status');
    }
  };

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
      const pricePerCoinKobo = nairaToKobo(formPricePerCoinNaira);

      if (editingGame) {
        await api.games.update(editingGame.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          standardPriceKobo,
          coinsRequired,
          pricePerCoinKobo,
        });
        setSuccessMessage(`Game "${formName}" pricing and configuration updated successfully.`);
        setEditingGame(null);
      } else {
        await api.games.create({
          name: formName.trim(),
          category: formCategory,
          description: formDescription.trim(),
          standardPriceKobo,
          coinsRequired,
          pricePerCoinKobo,
        });
        setSuccessMessage(`New game "${formName}" added to catalog.`);
        setShowAddModal(false);
      }

      loadGames();
    } catch (err: any) {
      setError(err.message || 'Failed to save game');
    } finally {
      setSaving(false);
    }
  };

  // Preview calculated price
  const previewCoins = parseInt(formCoinsRequired, 10) || 1;
  const previewCoinPrice = nairaToKobo(formPricePerCoinNaira);
  const calculatedCoinPriceKobo = previewCoins * previewCoinPrice;
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
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Price per Coin:</span>
                      <span className="font-mono text-slate-200">{formatNaira(game.pricePerCoinKobo)}</span>
                    </div>
                    <div className="border-t border-slate-800 pt-1.5 flex justify-between items-baseline text-xs">
                      <span className="font-semibold text-slate-300">Play Price (Coins × Rate):</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {formatNaira(game.calculatedPriceKobo)}
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
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Price per Coin (₦)</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formPricePerCoinNaira}
                        onChange={e => setFormPricePerCoinNaira(e.target.value)}
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
    </div>
  );
}
