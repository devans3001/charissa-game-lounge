import React, { useState, useEffect } from 'react';
import { Game, PaymentMethod, Transaction, GameCategory, CustomerTab, BankAccount } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { formatNaira, formatLagosDateTime } from '../lib/utils.ts';
import {
  Gamepad2,
  Coins,
  CircleDot,
  CreditCard,
  Banknote,
  SendHorizontal,
  CheckCircle2,
  Printer,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Receipt,
  X,
  AlertCircle,
  BookmarkCheck,
  Users,
  Search,
  Clock,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Layers,
  Save,
  HelpCircle,
  Landmark,
  Copy,
  ShoppingCart
} from 'lucide-react';

interface CartItem {
  id: string; // unique item draft id
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  quantity: number;
  unitPriceKobo: number;
  totalAmountKobo: number;
  coinsRequiredSnapshot?: number;
  pricePerCoinKoboSnapshot?: number;
}

interface NewSaleViewProps {
  onTransactionCreated?: (txn: Transaction) => void;
}

export function NewSaleView({ onTransactionCreated }: NewSaleViewProps) {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);

  // Active customer tabs from server
  const [activeTabs, setActiveTabs] = useState<CustomerTab[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null); // null = new draft tab

  // Current tab / customer form state
  const [customerName, setCustomerName] = useState<string>('');
  const [stationOrNote, setStationOrNote] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Catalog filtering
  const [catalogCategory, setCatalogCategory] = useState<GameCategory | 'ALL'>('ALL');
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  // Payment checkout state
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('');
  const [amountTendered, setAmountTendered] = useState<string>('');

  // Shift summary stats for cashier
  const [shiftCount, setShiftCount] = useState<number>(0);
  const [shiftTotalKobo, setShiftTotalKobo] = useState<number>(0);

  // Loading & Feedback
  const [savingTab, setSavingTab] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [completedTxn, setCompletedTxn] = useState<Transaction | null>(null);

  // Tabs search modal / drawer for managing 20+ tabs
  const [showAllTabsModal, setShowAllTabsModal] = useState<boolean>(false);
  const [tabFilterSearch, setTabFilterSearch] = useState<string>('');

  // Bank transfer accounts (shown to customers for transfers)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Mobile POS view tab: 'CATALOG' vs 'CART' (Customer details & checkout)
  const [mobilePosTab, setMobilePosTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  useEffect(() => {
    loadGames();
    loadActiveTabs();
    loadCashierShiftStats();
    loadBankAccounts();
  }, []);

  const loadBankAccounts = async () => {
    try {
      const res = await api.bankAccounts.list();
      setBankAccounts(res.accounts.filter(a => a.isActive));
    } catch (err) {
      console.error('Failed to load bank accounts:', err);
    }
  };

  const handleCopyAccountNumber = (acctNo: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(acctNo).then(() => {
        showToast(`Account number ${acctNo} copied — show it to the customer.`);
      }).catch(() => {
        showToast(`Account number: ${acctNo}`);
      });
    } else {
      showToast(`Account number: ${acctNo}`);
    }
  };

  const loadGames = async () => {
    try {
      setLoadingGames(true);
      const res = await api.games.list(false);
      setGames(res.games);
    } catch (err: any) {
      setError('Failed to load active games catalog: ' + err.message);
    } finally {
      setLoadingGames(false);
    }
  };

  const loadActiveTabs = async () => {
    try {
      setLoadingTabs(true);
      const res = await api.tabs.list({ status: 'OPEN' });
      setActiveTabs(res.tabs);
    } catch (err: any) {
      console.error('Failed to load active tabs:', err);
    } finally {
      setLoadingTabs(false);
    }
  };

  const loadCashierShiftStats = async () => {
    try {
      const { stats } = await api.dashboard.getStats({ period: 'today' });
      setShiftCount(stats.totalTransactions);
      setShiftTotalKobo(stats.totalRevenueKobo);
    } catch (err) {
      console.error('Failed to load shift stats:', err);
    }
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4500);
  };

  // Grand Total of current customer cart
  const cartGrandTotalKobo = cartItems.reduce((sum, item) => sum + item.totalAmountKobo, 0);
  const totalPlaysCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Add a game to current customer cart
  const handleAddGameToCart = (game: Game) => {
    setError(null);
    setCartItems(prev => {
      const existingIndex = prev.findIndex(item => item.gameId === game.id);
      if (existingIndex >= 0) {
        // Increment quantity
        const updated = [...prev];
        const item = updated[existingIndex];
        const newQty = item.quantity + 1;
        updated[existingIndex] = {
          ...item,
          quantity: newQty,
          totalAmountKobo: item.unitPriceKobo * newQty,
        };
        return updated;
      } else {
        // Add new item
        const newItem: CartItem = {
          id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          gameId: game.id,
          gameName: game.name,
          gameCategory: game.category,
          quantity: 1,
          unitPriceKobo: game.calculatedPriceKobo,
          totalAmountKobo: game.calculatedPriceKobo,
          coinsRequiredSnapshot: game.category === 'COIN_GAME' ? game.coinsRequired : undefined,
          pricePerCoinKoboSnapshot: game.category === 'COIN_GAME' ? game.pricePerCoinKobo : undefined,
        };
        return [...prev, newItem];
      }
    });
  };

  // Update item quantity
  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCartItems(prev => {
      return prev
        .map(item => {
          if (item.id === itemId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return {
              ...item,
              quantity: newQty,
              totalAmountKobo: item.unitPriceKobo * newQty,
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  // Remove item completely
  const handleRemoveItem = (itemId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  // Switch to an existing saved customer tab
  const handleSelectTab = (tab: CustomerTab) => {
    setError(null);
    setSelectedTabId(tab.id);
    setCustomerName(tab.customerName);
    setStationOrNote(tab.stationOrNote || '');
    setPhoneNumber(tab.phoneNumber || '');
    setCartItems(
      tab.items.map(it => ({
        id: it.id,
        gameId: it.gameId,
        gameName: it.gameName,
        gameCategory: it.gameCategory,
        quantity: it.quantity,
        unitPriceKobo: it.unitPriceKobo,
        totalAmountKobo: it.totalAmountKobo,
        coinsRequiredSnapshot: it.coinsRequiredSnapshot,
        pricePerCoinKoboSnapshot: it.pricePerCoinKoboSnapshot,
      }))
    );
    setIsCheckingOut(false);
    setShowAllTabsModal(false);
    setMobilePosTab('CART');
  };

  // Start a fresh new customer tab / entry
  const handleStartNewTab = () => {
    setSelectedTabId(null);
    setCustomerName('');
    setStationOrNote('');
    setPhoneNumber('');
    setCartItems([]);
    setIsCheckingOut(false);
    setError(null);
    setMobilePosTab('CATALOG');
  };

  // Save / Update tab (keep entry open without paying yet)
  const handleSaveTab = async () => {
    if (!customerName.trim()) {
      setError('Please provide a Customer Name or Station identifier (e.g. "Chinedu", "Station 4 - Tunde").');
      return;
    }

    if (cartItems.length === 0) {
      setError('Please add at least one game to the customer\'s tab before saving.');
      return;
    }

    setError(null);
    setSavingTab(true);

    try {
      if (selectedTabId) {
        // Update existing tab
        const res = await api.tabs.update(selectedTabId, {
          customerName: customerName.trim(),
          stationOrNote: stationOrNote.trim() || undefined,
          phoneNumber: phoneNumber.trim() || undefined,
          items: cartItems.map(it => ({
            id: it.id,
            gameId: it.gameId,
            quantity: it.quantity,
          })),
        });

        // Update list
        setActiveTabs(prev => prev.map(t => (t.id === selectedTabId ? res.tab : t)));
        showToast(`Saved updates to Tab #${res.tab.tabNumber} for ${res.tab.customerName} (${formatNaira(res.tab.totalAmountKobo)}). Kept open.`);
      } else {
        // Create new tab
        const res = await api.tabs.create({
          customerName: customerName.trim(),
          stationOrNote: stationOrNote.trim() || undefined,
          phoneNumber: phoneNumber.trim() || undefined,
          items: cartItems.map(it => ({
            gameId: it.gameId,
            quantity: it.quantity,
          })),
        });

        setActiveTabs(prev => [res.tab, ...prev]);
        setSelectedTabId(res.tab.id);
        showToast(`Created & Saved Tab #${res.tab.tabNumber} for ${res.tab.customerName} (${formatNaira(res.tab.totalAmountKobo)}). Tab is kept open for later payment.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save customer tab');
    } finally {
      setSavingTab(false);
    }
  };

  // Cancel / Delete open tab
  const handleDeleteTab = async () => {
    if (!selectedTabId) {
      handleStartNewTab();
      return;
    }

    if (!window.confirm(`Are you sure you want to cancel and remove this saved tab for ${customerName}?`)) {
      return;
    }

    try {
      await api.tabs.delete(selectedTabId);
      setActiveTabs(prev => prev.filter(t => t.id !== selectedTabId));
      showToast(`Tab for "${customerName}" was cancelled.`);
      handleStartNewTab();
    } catch (err: any) {
      setError(err.message || 'Failed to delete customer tab');
    }
  };

  // Checkout and settle payment
  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cartItems.length === 0) {
      setError('Please add at least one game to this customer\'s bill before checking out.');
      return;
    }

    if (paymentMethod === 'BANK_TRANSFER' && !senderName.trim()) {
      setError('Customer / Sender Full Name is required to verify Bank Transfer.');
      return;
    }

    setSubmittingPayment(true);
    try {
      let finalTxn: Transaction;

      if (selectedTabId) {
        // First ensure tab is saved with latest cart items
        await api.tabs.update(selectedTabId, {
          customerName: customerName.trim() || 'Guest Customer',
          stationOrNote: stationOrNote.trim() || undefined,
          phoneNumber: phoneNumber.trim() || undefined,
          items: cartItems.map(it => ({
            id: it.id,
            gameId: it.gameId,
            quantity: it.quantity,
          })),
        });

        // Checkout tab
        const res = await api.tabs.checkout(selectedTabId, {
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
          senderName: paymentMethod === 'BANK_TRANSFER' ? senderName.trim() : undefined,
        });

        finalTxn = res.transaction;
        // Remove from active tabs list
        setActiveTabs(prev => prev.filter(t => t.id !== selectedTabId));
      } else {
        // Direct multi-item checkout without saving open tab first
        const res = await api.transactions.create({
          customerName: customerName.trim() || undefined,
          items: cartItems.map(it => ({
            gameId: it.gameId,
            quantity: it.quantity,
          })),
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
          senderName: paymentMethod === 'BANK_TRANSFER' ? senderName.trim() : undefined,
        });

        finalTxn = res.transaction;
      }

      setCompletedTxn(finalTxn);
      setShiftCount(prev => prev + 1);
      setShiftTotalKobo(prev => prev + finalTxn.totalAmountKobo);

      if (onTransactionCreated) {
        onTransactionCreated(finalTxn);
      }
    } catch (err: any) {
      setError(err.message || 'Payment processing failed');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const resetFormForNextCustomer = () => {
    setCompletedTxn(null);
    setIsCheckingOut(false);
    setPaymentReference('');
    setSenderName('');
    setAmountTendered('');
    handleStartNewTab();
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  // Filtered games in catalog
  const filteredGames = games.filter(g => {
    if (catalogCategory !== 'ALL' && g.category !== catalogCategory) return false;
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase().trim();
      return (
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate change for cash payment
  const numericTendered = parseFloat(amountTendered) || 0;
  const tenderedKobo = Math.round(numericTendered * 100);
  const changeKobo = Math.max(0, tenderedKobo - cartGrandTotalKobo);

  // Total unpaid volume across all active customer tabs
  const totalOpenTabsKobo = activeTabs.reduce((s, t) => s + t.totalAmountKobo, 0);

  const selectedCurrentTab = activeTabs.find(t => t.id === selectedTabId);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl shadow-emerald-950/60 flex items-center gap-3 border border-emerald-400/40 animate-in fade-in slide-in-from-top-4">
          <BookmarkCheck className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{successToast}</span>
        </div>
      )}

      {/* Cashier Shift Status Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-semibold text-sm">
            {user?.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm">{user?.name}</span>
              <span className="text-[11px] text-slate-400 font-mono">({user?.role})</span>
            </div>
            <p className="text-xs text-slate-400">Cashier Terminal Active · Multi-Customer Session Hub</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block">Today's Settled Sales</span>
            <span className="text-lg font-bold text-white font-mono">{shiftCount} sales</span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block">Total Shift Collected</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">{formatNaira(shiftTotalKobo)}</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          ACTIVE CUSTOMER TABS STRIP (Open Entries / Up to 20+ Customers at Once)
         ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Active Customer Tabs / Open Entries</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {activeTabs.length} active {activeTabs.length === 1 ? 'customer' : 'customers'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Hold multiple customers at once · Select games, save tabs, and collect payment when they are ready
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTabs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllTabsModal(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                View & Search All ({activeTabs.length})
              </button>
            )}

            <button
              type="button"
              onClick={handleStartNewTab}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                selectedTabId === null
                  ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/50'
                  : 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              New Customer Tab
            </button>
          </div>
        </div>

        {/* Scrollable Customer Tabs Strip */}
        {activeTabs.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
            <p className="text-xs text-slate-400">
              No open customer tabs currently active. Create an entry below, select games, and click <strong className="text-indigo-300">"Save Tab (Keep Open)"</strong> to track any customer until they pay.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-1 no-scrollbar">
            {/* "New Draft Tab" Chip */}
            <button
              type="button"
              onClick={handleStartNewTab}
              className={`shrink-0 px-3 py-2 rounded-xl text-left border transition cursor-pointer flex items-center gap-2.5 ${
                selectedTabId === null
                  ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${selectedTabId === null ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`} />
              <div>
                <div className="text-xs font-semibold whitespace-nowrap">
                  {selectedTabId === null ? (customerName.trim() || 'New Customer Entry') : '+ New Customer Tab'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {selectedTabId === null ? `${cartItems.length} games · ${formatNaira(cartGrandTotalKobo)}` : 'Draft sale'}
                </div>
              </div>
            </button>

            {/* Existing Open Customer Tabs Chips */}
            {activeTabs.map(tab => {
              const isSelected = selectedTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectTab(tab)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-left border transition cursor-pointer flex items-center gap-2.5 ${
                    isSelected
                      ? 'bg-emerald-600/20 border-emerald-500 text-white shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/50'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white whitespace-nowrap">
                        {tab.customerName}
                      </span>
                      {tab.stationOrNote && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({tab.stationOrNote})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono flex items-center gap-1.5 mt-0.5">
                      <span className="text-slate-400">{tab.items.length} {tab.items.length === 1 ? 'game' : 'games'}</span>
                      <span className="text-slate-600">·</span>
                      <span className="font-semibold text-emerald-400">{formatNaira(tab.totalAmountKobo)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* =========================================================================
          MAIN POS WORKSPACE: RESPONSIVE 2-COLUMN LAYOUT
          Mobile: Fast toggle between Catalog & Customer Bill
          Desktop: Side-by-side simultaneous POS counter
         ========================================================================= */}

      {/* Mobile Mode Switcher (Visible on < lg) */}
      <div className="lg:hidden flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-1 gap-1">
        <button
          type="button"
          onClick={() => setMobilePosTab('CATALOG')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px] cursor-pointer ${
            mobilePosTab === 'CATALOG'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Game Catalog ({games.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMobilePosTab('CART')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px] cursor-pointer ${
            mobilePosTab === 'CART'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Bill ({cartItems.length})</span>
          {cartItems.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 font-bold">
              {formatNaira(cartGrandTotalKobo)}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Customer & Cart / Checkout (5 cols on lg) */}
        <div className={`lg:col-span-5 space-y-6 ${mobilePosTab === 'CART' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6 shadow-xl">
            {/* Customer Information Header */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                    1
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Customer Information
                  </h3>
                </div>

                {selectedCurrentTab ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                    Tab #{selectedCurrentTab.tabNumber}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-400">
                    Draft Entry
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Customer Name or Identifier <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Chinedu, Alvin, Emeka (Station 4)"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Station / Table Note
                    </label>
                    <input
                      type="text"
                      value={stationOrNote}
                      onChange={e => setStationOrNote(e.target.value)}
                      placeholder="e.g. TV 3, Table 2"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                      placeholder="e.g. 08050870100"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Games for this Customer (Multi-Game Cart) */}
            <div>
              <div className="flex items-center justify-between mb-3 border-t border-slate-800 pt-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                    2
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Selected Games ({cartItems.length})
                  </h3>
                </div>
                {cartItems.length > 0 && (
                  <span className="text-xs text-slate-400 font-mono">
                    {totalPlaysCount} total plays
                  </span>
                )}
              </div>

              {cartItems.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/50 text-center space-y-2">
                  <Gamepad2 className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">No games added to customer tab yet</p>
                  <p className="text-[11px] text-slate-500">
                    Click any PlayStation game, Snooker table, or Coin arcade from the catalog on the right to add to this customer's bill.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {cartItems.map(item => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 group hover:border-slate-700 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{item.gameName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-400">
                            {item.gameCategory === 'PS_GAME' ? 'PS' : item.gameCategory === 'SNOOKER' ? 'Snooker' : 'Arcade'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {formatNaira(item.unitPriceKobo)} each
                          {item.coinsRequiredSnapshot && ` · ${item.coinsRequiredSnapshot * item.quantity} coins`}
                        </div>
                      </div>

                      {/* Quantity Stepper & Price */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-xs font-mono font-bold text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-right min-w-[70px]">
                          <span className="text-xs font-bold font-mono text-emerald-400 block">
                            {formatNaira(item.totalAmountKobo)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-500 hover:text-red-400 p-1 rounded transition cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bill Summary & Main Action Bar */}
            <div className="border-t border-slate-800 pt-4 space-y-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400 block">Total Due</span>
                  <span className="text-xs text-slate-500">
                    {cartItems.length} {cartItems.length === 1 ? 'game type' : 'game types'} · {totalPlaysCount} plays
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-emerald-400 font-mono">
                    {formatNaira(cartGrandTotalKobo)}
                  </span>
                </div>
              </div>

              {/* Action Buttons: Save Tab (Open) vs Settle Payment */}
              {!isCheckingOut ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Action 1: Save Tab (Hold open without paying) */}
                    <button
                      type="button"
                      onClick={handleSaveTab}
                      disabled={savingTab || cartItems.length === 0}
                      className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-850 text-slate-100 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition disabled:opacity-40 cursor-pointer shadow-sm"
                    >
                      {savingTab ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Save className="w-4 h-4 text-indigo-400" />
                          {selectedTabId ? 'Save & Keep Open' : 'Save Tab (Hold Open)'}
                        </>
                      )}
                    </button>

                    {/* Action 2: Proceed to Checkout / Payment */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!customerName.trim()) {
                          setError('Please enter a Customer Name before receiving payment.');
                          return;
                        }
                        if (cartItems.length === 0) {
                          setError('Please add games to the customer\'s bill before receiving payment.');
                          return;
                        }
                        setError(null);
                        setIsCheckingOut(true);
                      }}
                      disabled={cartItems.length === 0}
                      className="py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer shadow-lg shadow-indigo-600/30"
                    >
                      <Receipt className="w-4 h-4" />
                      Receive Payment
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                      Click "Save Tab" to hold for later payment
                    </span>
                    {selectedTabId && (
                      <button
                        type="button"
                        onClick={handleDeleteTab}
                        className="text-red-400 hover:underline cursor-pointer"
                      >
                        Cancel / Discard Tab
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Checkout Payment Mode */
                <form onSubmit={handleConfirmCheckout} className="space-y-4 bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-indigo-400" />
                      Receive Payment for {customerName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCheckingOut(false)}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Back
                    </button>
                  </div>

                  {/* Payment Method Selector */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        paymentMethod === 'CASH'
                          ? 'bg-emerald-600/20 border-emerald-500 text-white font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Banknote className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                      <span className="text-xs">Cash</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('POS')}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        paymentMethod === 'POS'
                          ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 mx-auto mb-1 text-indigo-400" />
                      <span className="text-xs">POS / Card</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('BANK_TRANSFER')}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                        paymentMethod === 'BANK_TRANSFER'
                          ? 'bg-violet-600/20 border-violet-500 text-white font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <SendHorizontal className="w-4 h-4 mx-auto mb-1 text-violet-400" />
                      <span className="text-xs">Transfer</span>
                    </button>
                  </div>

                  {/* Bank Transfer specific requirements */}
                  {paymentMethod === 'BANK_TRANSFER' && (
                    <div className="space-y-2.5 p-3 rounded-lg bg-violet-950/30 border border-violet-800/50">
                      <div>
                        <label className="block text-[11px] font-semibold text-violet-200 mb-1">
                          Sender Full Name (as shown in bank alert) <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={senderName}
                          onChange={e => setSenderName(e.target.value)}
                          placeholder="e.g. John Kelechi Okafor"
                          className="w-full rounded-lg border border-violet-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-violet-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Transfer Ref / Session ID (Optional)
                        </label>
                        <input
                          type="text"
                          value={paymentReference}
                          onChange={e => setPaymentReference(e.target.value)}
                          placeholder="e.g. GTBank / 09283719"
                          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-violet-400 outline-none"
                        />
                      </div>

                      {/* Bank accounts to show the customer */}
                      {bankAccounts.length > 0 && (
                        <div className="pt-2 border-t border-violet-800/40">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Landmark className="w-3.5 h-3.5 text-violet-300" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-200">
                              Show the customer these accounts
                            </span>
                          </div>
                          <div className="space-y-2">
                            {bankAccounts.map(acc => (
                              <div
                                key={acc.id}
                                className="flex items-center justify-between gap-2 bg-slate-950 border border-violet-900/50 rounded-lg px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white truncate">
                                    {acc.bankName}
                                    {acc.label && <span className="text-[10px] text-violet-300 ml-1.5">({acc.label})</span>}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono truncate">
                                    {acc.accountNumber} · {acc.accountName}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyAccountNumber(acc.accountNumber)}
                                  className="shrink-0 p-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 text-violet-200 transition cursor-pointer"
                                  title="Copy account number"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {bankAccounts.length === 0 && (
                        <div className="pt-2 border-t border-violet-800/40 text-[11px] text-violet-300/70">
                          No bank accounts configured yet — ask the admin to add them under "Transfer Accounts".
                        </div>
                      )}
                    </div>
                  )}

                  {/* POS Specific reference */}
                  {paymentMethod === 'POS' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        POS Slip RRN / Auth Code (Recommended)
                      </label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={e => setPaymentReference(e.target.value)}
                        placeholder="e.g. POS-SLIP-9923 or 008129"
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-400 outline-none"
                      />
                    </div>
                  )}

                  {/* Cash Change Calculator */}
                  {paymentMethod === 'CASH' && (
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-0.5">
                          Cash Tendered (₦)
                        </label>
                        <input
                          type="number"
                          value={amountTendered}
                          onChange={e => setAmountTendered(e.target.value)}
                          placeholder={String(cartGrandTotalKobo / 100)}
                          className="w-full rounded bg-slate-950 border border-slate-800 px-2 py-1 text-xs text-white font-mono outline-none"
                        />
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-semibold uppercase text-slate-400 mb-0.5">
                          Change Due
                        </span>
                        <span className="text-sm font-bold font-mono text-emerald-400">
                          {formatNaira(changeKobo)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Settle Submit Button */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCheckingOut(false)}
                      className="px-3 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingPayment}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                    >
                      {submittingPayment ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Confirm & Collect {formatNaira(cartGrandTotalKobo)}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Games Selection Catalog (7 cols on lg) */}
        <div className={`lg:col-span-7 space-y-4 ${mobilePosTab === 'CATALOG' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-indigo-400" />
                  Select Games to Add
                </h3>
                <p className="text-xs text-slate-400">
                  Click any game to add it to the active customer's bill
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="Search games..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setCatalogCategory('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  catalogCategory === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All Games ({games.length})
              </button>

              <button
                type="button"
                onClick={() => setCatalogCategory('PS_GAME')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  catalogCategory === 'PS_GAME'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5 text-indigo-400" />
                PlayStation ({games.filter(g => g.category === 'PS_GAME').length})
              </button>

              <button
                type="button"
                onClick={() => setCatalogCategory('SNOOKER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  catalogCategory === 'SNOOKER'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <CircleDot className="w-3.5 h-3.5 text-emerald-400" />
                Snooker Table ({games.filter(g => g.category === 'SNOOKER').length})
              </button>

              <button
                type="button"
                onClick={() => setCatalogCategory('COIN_GAME')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  catalogCategory === 'COIN_GAME'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                Coin Arcade ({games.filter(g => g.category === 'COIN_GAME').length})
              </button>
            </div>

            {/* Catalog Grid */}
            {loadingGames ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Loading lounge catalog...
              </div>
            ) : filteredGames.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No games match your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[580px] overflow-y-auto pr-1">
                {filteredGames.map(game => {
                  const alreadyInCart = cartItems.find(it => it.gameId === game.id);
                  const isPs = game.category === 'PS_GAME';
                  const isSnooker = game.category === 'SNOOKER';

                  return (
                    <div
                      key={game.id}
                      onClick={() => handleAddGameToCart(game)}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer relative group flex flex-col justify-between ${
                        alreadyInCart
                          ? 'bg-indigo-950/30 border-indigo-500/60 shadow-sm'
                          : 'bg-slate-950 border-slate-800/90 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`p-1.5 rounded-lg ${
                                isPs
                                  ? 'bg-indigo-600/20 text-indigo-400'
                                  : isSnooker
                                  ? 'bg-emerald-600/20 text-emerald-400'
                                  : 'bg-amber-600/20 text-amber-400'
                              }`}
                            >
                              {isPs ? (
                                <Gamepad2 className="w-4 h-4" />
                              ) : isSnooker ? (
                                <CircleDot className="w-4 h-4" />
                              ) : (
                                <Coins className="w-4 h-4" />
                              )}
                            </div>
                            <span className="font-bold text-white text-xs leading-snug">
                              {game.name}
                            </span>
                          </div>

                          {alreadyInCart && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                              {alreadyInCart.quantity} added
                            </span>
                          )}
                        </div>

                        {game.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-1.5 pl-0.5">
                            {game.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 block">
                            {game.category === 'COIN_GAME' ? `${game.coinsRequired} Coins required` : 'Standard Rate'}
                          </span>
                          <span className="font-bold font-mono text-emerald-400 text-sm">
                            {formatNaira(game.calculatedPriceKobo)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleAddGameToCart(game);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Floating Cart Summary Button when browsing catalog */}
      {mobilePosTab === 'CATALOG' && cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-16 left-3 right-3 z-30 animate-in fade-in slide-in-from-bottom-2 no-print">
          <button
            type="button"
            onClick={() => setMobilePosTab('CART')}
            className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-between shadow-2xl shadow-indigo-950 border border-indigo-400/40 min-h-[48px] cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span>{cartItems.length} {cartItems.length === 1 ? 'game' : 'games'} in bill</span>
              <span className="text-indigo-200">·</span>
              <span className="font-mono text-emerald-300 text-sm">{formatNaira(cartGrandTotalKobo)}</span>
            </div>
            <div className="flex items-center gap-1 font-semibold text-white">
              <span>Review Bill & Pay</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* =========================================================================
          ALL TABS MANAGEMENT MODAL / DRAWER (Easily manage 20+ active customers)
         ========================================================================= */}
      {showAllTabsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">All Active Customer Tabs ({activeTabs.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAllTabsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={tabFilterSearch}
                onChange={e => setTabFilterSearch(e.target.value)}
                placeholder="Search customers by name, tab number, or station..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* List of tabs */}
            <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
              {activeTabs
                .filter(t => {
                  if (!tabFilterSearch.trim()) return true;
                  const q = tabFilterSearch.toLowerCase();
                  return (
                    t.customerName.toLowerCase().includes(q) ||
                    t.tabNumber.toLowerCase().includes(q) ||
                    (t.stationOrNote && t.stationOrNote.toLowerCase().includes(q))
                  );
                })
                .map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => handleSelectTab(tab)}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/70 hover:bg-slate-900 transition cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{tab.customerName}</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {tab.tabNumber}
                        </span>
                        {tab.stationOrNote && (
                          <span className="text-xs text-indigo-400 font-medium">
                            · {tab.stationOrNote}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        <span>{tab.items.length} {tab.items.length === 1 ? 'game' : 'games'}</span>
                        <span>·</span>
                        <span className="text-[11px] text-slate-500">
                          Opened: {formatLagosDateTime(tab.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-base font-extrabold font-mono text-emerald-400">
                        {formatNaira(tab.totalAmountKobo)}
                      </span>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleSelectTab(tab);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition"
                      >
                        Open Bill
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Total unpaid on open tabs: <strong className="text-emerald-400 font-mono">{formatNaira(totalOpenTabsKobo)}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setShowAllTabsModal(false);
                  handleStartNewTab();
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                + Open New Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION & PRINTABLE RECEIPT MODAL
         ========================================================================= */}
      {completedTxn && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-100">
            <button
              type="button"
              onClick={resetFormForNextCustomer}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-white">Payment Recorded Successfully</h3>
              <p className="text-xs text-slate-400 mt-1">Transaction logged into lounge financial ledger</p>
            </div>

            {/* Thermal / Standard Receipt Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs space-y-3 print-card">
              <div className="text-center border-b border-slate-800 pb-2">
                <div className="font-bold text-sm text-white">GAME LOUNGE ABUJA/LAGOS</div>
                <div className="text-[11px] text-slate-400">Official Customer Sales Slip</div>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Receipt No:</span>
                <span className="font-bold text-white">{completedTxn.receiptNumber}</span>
              </div>

              {completedTxn.customerName && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer:</span>
                  <span className="font-bold text-white">{completedTxn.customerName}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-slate-400">Date/Time (Lagos):</span>
                <span>{formatLagosDateTime(completedTxn.timestamp)}</span>
              </div>

              {/* Itemized Games List */}
              <div className="border-t border-b border-slate-800 py-2 space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-slate-400">Games Played Breakdown:</div>
                {completedTxn.items && completedTxn.items.length > 0 ? (
                  completedTxn.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px]">
                      <div>
                        <span className="text-white font-semibold">{it.gameName}</span>
                        <span className="text-slate-500 ml-1">x{it.quantity}</span>
                      </div>
                      <span className="text-slate-200">{formatNaira(it.totalAmountKobo)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-white font-semibold">{completedTxn.gameName}</span>
                    <span className="text-slate-200">{formatNaira(completedTxn.totalAmountKobo)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Payment Method:</span>
                <span className="font-semibold text-indigo-300">{completedTxn.paymentMethod}</span>
              </div>

              {completedTxn.senderName && (
                <div className="flex justify-between text-violet-300">
                  <span className="text-slate-400 font-normal">Transfer Sender:</span>
                  <span className="font-semibold">{completedTxn.senderName}</span>
                </div>
              )}

              {completedTxn.paymentReference && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Slip Ref / RRN:</span>
                  <span className="text-slate-200">{completedTxn.paymentReference}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-slate-400">Cashier:</span>
                <span>{completedTxn.cashierName}</span>
              </div>

              <div className="border-t border-slate-800 pt-2 flex justify-between items-baseline text-sm">
                <span className="font-bold text-slate-300">Total Paid:</span>
                <span className="font-extrabold text-emerald-400 text-base">
                  {formatNaira(completedTxn.totalAmountKobo)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 no-print">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print Receipt
              </button>

              <button
                type="button"
                onClick={resetFormForNextCustomer}
                className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                <RotateCcw className="w-4 h-4" />
                Next Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
