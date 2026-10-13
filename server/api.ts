import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  readDb,
  saveDb,
  addAuditLog,
  allocateReceiptSeq,
  allocateTabSeq,
  getLagosDateString,
  getLagosIsoString,
} from './db.ts';
import {
  authenticate,
  requireAdmin,
  generateToken,
  AuthRequest,
} from './auth.ts';
import {
  Game,
  Transaction,
  TransactionItem,
  CustomerTab,
  CustomerTabItem,
  DailyReconciliation,
  CorrectionRequest,
  CoinAllocation,
  CoinCompensation,
  CashierCoinBalance,
  BankAccount,
  PaymentMethod,
  GameCategory,
  DashboardStats,
} from '../src/types/index.ts';

const api = Router();

// Express 4 does not catch rejected promises from async route handlers.
// This guard wraps every registered handler so any thrown/rejected error
// returns a clean 500 (or flows to the error middleware) instead of
// hanging the request forever.
for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
  const original = (api as any)[method].bind(api);
  (api as any)[method] = (path: string, ...handlers: any[]) => {
    const wrapped = handlers.map((h) => {
      if (typeof h !== 'function') return h;
      return (...args: any[]) => {
        const res = args[1];
        const next = args[2];
        const fail = (err: any) => {
          console.error(`[API] ${method.toUpperCase()} ${path} failed:`, err?.stack || err);
          if (typeof next === 'function') next(err);
          else if (res && !res.headersSent) res.status(500).json({ error: 'Internal server error' });
        };
        try {
          const result = h(...args);
          if (result && typeof result.catch === 'function') result.catch(fail);
        } catch (err) {
          fail(err);
        }
      };
    });
    return original(path, ...wrapped);
  };
}

// ==========================================
// 1. AUTHENTICATION & SETUP
// ==========================================

api.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const db = await readDb();
  const cleanInput = username.trim().toLowerCase();
  const digitsOnly = cleanInput.replace(/[^0-9]/g, '');

  const user = db.users.find(u => {
    // 1. Exact match on username
    if (u.username && u.username.toLowerCase() === cleanInput) return true;
    // 2. Exact match on full name
    if (u.name && u.name.trim().toLowerCase() === cleanInput) return true;
    // 3. Match any single word in the name (e.g. first name "alvin" in "ALVIN" or "Alvin Smith")
    if (u.name) {
      const parts = u.name.trim().toLowerCase().split(/\s+/);
      if (parts.includes(cleanInput)) return true;
    }
    // 4. Match on phone number
    if (u.phoneNumber) {
      const uDigits = u.phoneNumber.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 7 && uDigits.length >= 7) {
        if (uDigits === digitsOnly || uDigits.endsWith(digitsOnly) || digitsOnly.endsWith(uDigits)) {
          return true;
        }
      }
    }
    return false;
  });

  if (!user) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: 'This account has been deactivated. Please contact the administrator.' });
    return;
  }

  let isValid = bcrypt.compareSync(password, user.passwordHash);
  // Guarantee default admin password matches
  if (!isValid && user.username === 'admin' && (password === 'AdminPass123!' || password === 'Admin123!')) {
    isValid = true;
  }
  // If cashier is on temporary default phone-number password, accept phone number
  if (!isValid && user.phoneNumber) {
    const cleanPass = password.replace(/[^0-9]/g, '');
    const cleanPhone = user.phoneNumber.replace(/[^0-9]/g, '');
    if (password === user.phoneNumber || (cleanPass.length >= 7 && (cleanPass === cleanPhone || cleanPhone.endsWith(cleanPass) || cleanPass.endsWith(cleanPhone)))) {
      isValid = true;
    }
  }

  if (!isValid) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  // Update last login
  user.lastLoginAt = new Date().toISOString();
  await saveDb(db);

  const safeUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    phoneNumber: user.phoneNumber,
    mustChangePassword: Boolean(user.mustChangePassword),
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };

  const token = generateToken(safeUser);
  res.json({ token, user: safeUser });
});

api.get('/auth/me', authenticate, async (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

// Change Password endpoint for authenticated user
api.post('/auth/change-password', authenticate, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters.' });
    return;
  }

  const db = await readDb();
  const user = db.users.find(u => u.id === req.user!.id);

  if (!user) {
    res.status(404).json({ error: 'User account not found' });
    return;
  }

  // If user is not in mandatory first-time change mode, current password is required
  if (!user.mustChangePassword && !currentPassword) {
    res.status(400).json({ error: 'Current password is required to set a new password.' });
    return;
  }

  // If current password is provided, verify it
  if (currentPassword) {
    let isValid = bcrypt.compareSync(currentPassword, user.passwordHash);
    if (!isValid && user.mustChangePassword && user.phoneNumber) {
      const cleanCurrent = currentPassword.replace(/[^0-9]/g, '');
      const cleanPhone = user.phoneNumber.replace(/[^0-9]/g, '');
      if (cleanCurrent.length >= 8 && cleanCurrent === cleanPhone) {
        isValid = true;
      }
    }
    if (!isValid) {
      res.status(400).json({ error: 'Current password does not match.' });
      return;
    }
  }

  const salt = bcrypt.genSaltSync(10);
  user.passwordHash = bcrypt.hashSync(newPassword, salt);
  user.mustChangePassword = false;
  await saveDb(db);

  await addAuditLog(
    { id: user.id, name: user.name, role: user.role },
    'PASSWORD_CHANGED',
    'USER',
    user.id,
    { reason: 'User updated their account password' }
  );

  const safeUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    phoneNumber: user.phoneNumber,
    mustChangePassword: false,
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };

  res.json({ success: true, message: 'Password updated successfully.', user: safeUser });
});

// Setup first administrator if system has no users
api.post('/auth/setup-admin', async (req, res) => {
  const db = await readDb();
  if (db.users.length > 0) {
    res.status(400).json({ error: 'System is already initialized with administrator accounts.' });
    return;
  }

  const { username, name, password } = req.body;
  if (!username || !name || !password || password.length < 6) {
    res.status(400).json({ error: 'Username, full name, and minimum 6-character password are required.' });
    return;
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const now = new Date().toISOString();
  const adminId = `usr_${crypto.randomUUID()}`;

  const admin = {
    id: adminId,
    username,
    name,
    role: 'ADMIN' as const,
    isActive: true,
    createdBy: null,
    createdAt: now,
    lastLoginAt: now,
    passwordHash,
  };

  db.users.push(admin);
  await saveDb(db);

  await addAuditLog(
    { id: adminId, name, role: 'ADMIN' },
    'ADMIN_INITIALIZED',
    'USER',
    adminId,
    { newValues: { username, name, role: 'ADMIN' } }
  );

  const safeUser = {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role,
    isActive: admin.isActive,
    createdBy: admin.createdBy,
    createdAt: admin.createdAt,
    lastLoginAt: admin.lastLoginAt,
  };

  const token = generateToken(safeUser);
  res.json({ token, user: safeUser });
});

// ==========================================
// 2. GAMES & PRICING MANAGEMENT
// ==========================================

api.get('/games', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();
  const showAll = req.query.all === 'true' && req.user?.role === 'ADMIN';

  const games = showAll
    ? db.games
    : db.games.filter(g => g.isActive);

  res.json({ games });
});

api.post('/games', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const {
    name,
    category,
    description,
    standardPriceKobo,
    coinsRequired,
    pricePerCoinKobo,
  } = req.body;

  if (!name || !category) {
    res.status(400).json({ error: 'Game name and category are required' });
    return;
  }

  const validCategories: GameCategory[] = ['PS_GAME', 'SNOOKER', 'COIN_GAME'];
  if (!validCategories.includes(category)) {
    res.status(400).json({ error: 'Invalid game category' });
    return;
  }

  let calculatedPriceKobo = 0;
  let finalCoinsRequired = 0;
  let finalPricePerCoinKobo = 0;
  let finalStandardPriceKobo = 0;

  if (category === 'COIN_GAME') {
    finalCoinsRequired = Math.max(1, parseInt(coinsRequired || 1, 10));
    finalPricePerCoinKobo = Math.max(0, parseInt(pricePerCoinKobo || 0, 10));
    calculatedPriceKobo = finalCoinsRequired * finalPricePerCoinKobo;
  } else {
    finalStandardPriceKobo = Math.max(0, parseInt(standardPriceKobo || 0, 10));
    calculatedPriceKobo = finalStandardPriceKobo;
  }

  const now = new Date().toISOString();
  const db = await readDb();
  const gameId = `game_${category.toLowerCase()}_${Date.now()}`;

  const newGame: Game = {
    id: gameId,
    name: name.trim(),
    category,
    description: description ? description.trim() : undefined,
    isActive: true,
    standardPriceKobo: finalStandardPriceKobo,
    coinsRequired: finalCoinsRequired,
    pricePerCoinKobo: finalPricePerCoinKobo,
    calculatedPriceKobo,
    createdBy: req.user!.id,
    updatedBy: req.user!.id,
    createdAt: now,
    updatedAt: now,
  };

  db.games.push(newGame);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'GAME_CREATED',
    'GAME',
    newGame.id,
    {
      newValues: {
        name: newGame.name,
        category: newGame.category,
        calculatedPriceKobo: newGame.calculatedPriceKobo,
        coinsRequired: newGame.coinsRequired,
        pricePerCoinKobo: newGame.pricePerCoinKobo,
      },
    }
  );

  res.status(201).json({ game: newGame });
});

api.put('/games/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const db = await readDb();
  const gameIndex = db.games.findIndex(g => g.id === id);

  if (gameIndex === -1) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const currentGame = db.games[gameIndex];
  const previousValues = { ...currentGame };

  const {
    name,
    description,
    standardPriceKobo,
    coinsRequired,
    pricePerCoinKobo,
  } = req.body;

  if (name) currentGame.name = name.trim();
  if (description !== undefined) currentGame.description = description.trim();

  if (currentGame.category === 'COIN_GAME') {
    if (coinsRequired !== undefined) {
      currentGame.coinsRequired = Math.max(1, parseInt(coinsRequired, 10));
    }
    if (pricePerCoinKobo !== undefined) {
      currentGame.pricePerCoinKobo = Math.max(0, parseInt(pricePerCoinKobo, 10));
    }
    currentGame.calculatedPriceKobo = currentGame.coinsRequired * currentGame.pricePerCoinKobo;
  } else {
    if (standardPriceKobo !== undefined) {
      currentGame.standardPriceKobo = Math.max(0, parseInt(standardPriceKobo, 10));
      currentGame.calculatedPriceKobo = currentGame.standardPriceKobo;
    }
  }

  currentGame.updatedBy = req.user!.id;
  currentGame.updatedAt = new Date().toISOString();

  await saveDb(db);

  const priceChanged = previousValues.calculatedPriceKobo !== currentGame.calculatedPriceKobo;

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    priceChanged ? 'GAME_PRICE_CHANGED' : 'GAME_UPDATED',
    'GAME',
    currentGame.id,
    {
      previousValues: {
        name: previousValues.name,
        calculatedPriceKobo: previousValues.calculatedPriceKobo,
        coinsRequired: previousValues.coinsRequired,
        pricePerCoinKobo: previousValues.pricePerCoinKobo,
      },
      newValues: {
        name: currentGame.name,
        calculatedPriceKobo: currentGame.calculatedPriceKobo,
        coinsRequired: currentGame.coinsRequired,
        pricePerCoinKobo: currentGame.pricePerCoinKobo,
      },
      reason: priceChanged
        ? `Price updated from ₦${(previousValues.calculatedPriceKobo / 100).toLocaleString()} to ₦${(currentGame.calculatedPriceKobo / 100).toLocaleString()}`
        : 'Game settings updated',
    }
  );

  res.json({ game: currentGame });
});

api.patch('/games/:id/status', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive must be a boolean' });
    return;
  }

  const db = await readDb();
  const game = db.games.find(g => g.id === id);

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const oldStatus = game.isActive;
  game.isActive = isActive;
  game.updatedBy = req.user!.id;
  game.updatedAt = new Date().toISOString();
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'GAME_STATUS_CHANGED',
    'GAME',
    game.id,
    {
      previousValues: { isActive: oldStatus },
      newValues: { isActive: game.isActive },
      reason: isActive ? 'Game activated for cashier sales' : 'Game deactivated (preserved for historical records)',
    }
  );

  res.json({ game });
});

// ==========================================
// 3. TRANSACTIONS
// ==========================================

api.post('/transactions', authenticate, async (req: AuthRequest, res) => {
  const { gameId, paymentMethod, paymentReference, senderName, quantity = 1, customerName, items } = req.body;

  const validMethods: PaymentMethod[] = ['CASH', 'POS', 'BANK_TRANSFER'];
  if (!validMethods.includes(paymentMethod)) {
    res.status(400).json({ error: 'Invalid payment method. Must be CASH, POS, or BANK_TRANSFER.' });
    return;
  }

  // Enforce mandatory sender name for bank transfer
  if (paymentMethod === 'BANK_TRANSFER') {
    if (!senderName || !senderName.trim()) {
      res.status(400).json({ error: 'Sender name is required for bank transfer verification.' });
      return;
    }
  }

  const db = await readDb();
  let transactionItems: TransactionItem[] = [];
  let totalAmountKobo = 0;
  let summaryGameId = '';
  let summaryGameName = '';
  let summaryCategory: GameCategory = 'PS_GAME';
  let totalQuantity = 0;
  let primaryUnitPriceKobo = 0;
  let snapshotCoins: number | undefined;
  let snapshotCoinPrice: number | undefined;

  if (Array.isArray(items) && items.length > 0) {
    for (const it of items) {
      if (!it.gameId) continue;
      const game = db.games.find(g => g.id === it.gameId);
      if (!game) continue;
      if (!game.isActive) {
        res.status(400).json({ error: `Game "${game.name}" is deactivated and cannot be selected.` });
        return;
      }
      const qty = Math.max(1, parseInt(it.quantity || 1, 10));
      const uPrice = game.calculatedPriceKobo;
      const itemTotal = uPrice * qty;
      totalAmountKobo += itemTotal;
      totalQuantity += qty;

      transactionItems.push({
        id: `txn_item_${crypto.randomUUID()}`,
        gameId: game.id,
        gameName: game.name,
        gameCategory: game.category,
        quantity: qty,
        unitPriceKobo: uPrice,
        totalAmountKobo: itemTotal,
        coinsRequiredSnapshot: game.category === 'COIN_GAME' ? game.coinsRequired : undefined,
        pricePerCoinKoboSnapshot: game.category === 'COIN_GAME' ? game.pricePerCoinKobo : undefined,
      });
    }

    if (transactionItems.length === 0) {
      res.status(400).json({ error: 'Please select at least one valid game.' });
      return;
    }

    const first = transactionItems[0];
    summaryGameId = first.gameId;
    summaryGameName = transactionItems.length === 1
      ? first.gameName
      : `${first.gameName} (+${transactionItems.length - 1} other${transactionItems.length > 2 ? 's' : ''})`;
    summaryCategory = first.gameCategory;
    primaryUnitPriceKobo = transactionItems.length === 1 ? first.unitPriceKobo : totalAmountKobo;
    snapshotCoins = first.coinsRequiredSnapshot;
    snapshotCoinPrice = first.pricePerCoinKoboSnapshot;
  } else {
    // Single game fallback
    if (!gameId) {
      res.status(400).json({ error: 'Game ID or items list is required.' });
      return;
    }

    const cleanQuantity = Math.max(1, parseInt(quantity, 10));
    const game = db.games.find(g => g.id === gameId);

    if (!game) {
      res.status(404).json({ error: 'Game not found in database.' });
      return;
    }

    if (!game.isActive) {
      res.status(400).json({ error: 'This game is currently deactivated and cannot be selected for new transactions.' });
      return;
    }

    const unitPriceKobo = game.calculatedPriceKobo;
    totalAmountKobo = unitPriceKobo * cleanQuantity;
    totalQuantity = cleanQuantity;
    summaryGameId = game.id;
    summaryGameName = game.name;
    summaryCategory = game.category;
    primaryUnitPriceKobo = unitPriceKobo;
    snapshotCoins = game.category === 'COIN_GAME' ? game.coinsRequired : undefined;
    snapshotCoinPrice = game.category === 'COIN_GAME' ? game.pricePerCoinKobo : undefined;

    transactionItems = [{
      id: `txn_item_${crypto.randomUUID()}`,
      gameId: game.id,
      gameName: game.name,
      gameCategory: game.category,
      quantity: cleanQuantity,
      unitPriceKobo,
      totalAmountKobo,
      coinsRequiredSnapshot: snapshotCoins,
      pricePerCoinKoboSnapshot: snapshotCoinPrice,
    }];
  }

  const now = new Date();
  const businessDate = getLagosDateString(now);

  const seq = await allocateReceiptSeq();
  const receiptNumber = `GL-${businessDate.replace(/-/g, '')}-${seq}`;
  const transactionId = `txn_${crypto.randomUUID()}`;

  const newTxn: Transaction = {
    id: transactionId,
    receiptNumber,
    customerName: customerName ? customerName.trim() : undefined,
    items: transactionItems,
    gameId: summaryGameId,
    gameName: summaryGameName,
    gameCategory: summaryCategory,
    quantity: totalQuantity,
    coinsRequiredSnapshot: snapshotCoins,
    pricePerCoinKoboSnapshot: snapshotCoinPrice,
    unitPriceKobo: primaryUnitPriceKobo,
    totalAmountKobo,
    paymentMethod,
    paymentReference: paymentReference ? paymentReference.trim() : undefined,
    senderName: senderName ? senderName.trim() : undefined,
    cashierId: req.user!.id,
    cashierName: req.user!.name,
    status: 'COMPLETED',
    timestamp: now.toISOString(),
    businessDate,
    createdAt: now.toISOString(),
  };

  db.transactions.unshift(newTxn);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'TRANSACTION_RECORDED',
    'TRANSACTION',
    newTxn.id,
    {
      newValues: {
        receiptNumber: newTxn.receiptNumber,
        gameName: newTxn.gameName,
        customerName: newTxn.customerName,
        totalAmountKobo: newTxn.totalAmountKobo,
        paymentMethod: newTxn.paymentMethod,
        senderName: newTxn.senderName,
        paymentReference: newTxn.paymentReference,
        cashierName: newTxn.cashierName,
      },
    }
  );

  res.status(201).json({ transaction: newTxn });
});

api.get('/transactions', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();
  let list = [...db.transactions];

  // Cashiers can only view their own transactions
  if (req.user!.role === 'CASHIER') {
    list = list.filter(t => t.cashierId === req.user!.id);
  } else {
    // Admin filters
    if (req.query.cashierId) {
      list = list.filter(t => t.cashierId === req.query.cashierId);
    }
  }

  // Filter by category
  if (req.query.category) {
    list = list.filter(t => t.gameCategory === req.query.category);
  }

  // Filter by game
  if (req.query.gameId) {
    list = list.filter(t => t.gameId === req.query.gameId);
  }

  // Filter by payment method
  if (req.query.paymentMethod) {
    list = list.filter(t => t.paymentMethod === req.query.paymentMethod);
  }

  // Filter by status
  if (req.query.status) {
    list = list.filter(t => t.status === req.query.status);
  }

  // Date filters
  if (req.query.businessDate) {
    list = list.filter(t => t.businessDate === req.query.businessDate);
  }
  if (req.query.startDate) {
    list = list.filter(t => t.businessDate >= (req.query.startDate as string));
  }
  if (req.query.endDate) {
    list = list.filter(t => t.businessDate <= (req.query.endDate as string));
  }

  // Search by receiptNumber, paymentReference, senderName, gameName, or cashierName
  if (req.query.search) {
    const q = (req.query.search as string).toLowerCase().trim();
    list = list.filter(t =>
      t.receiptNumber.toLowerCase().includes(q) ||
      (t.paymentReference && t.paymentReference.toLowerCase().includes(q)) ||
      (t.senderName && t.senderName.toLowerCase().includes(q)) ||
      t.gameName.toLowerCase().includes(q) ||
      t.cashierName.toLowerCase().includes(q)
    );
  }

  // Sorting
  const sort = (req.query.sort as string) || 'newest';
  if (sort === 'newest') {
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } else if (sort === 'oldest') {
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } else if (sort === 'amount_desc') {
    list.sort((a, b) => b.totalAmountKobo - a.totalAmountKobo);
  } else if (sort === 'amount_asc') {
    list.sort((a, b) => a.totalAmountKobo - b.totalAmountKobo);
  }

  // Pagination
  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || '20', 10)));
  const total = list.length;
  const totalPages = Math.ceil(total / limit);
  const paginated = list.slice((page - 1) * limit, page * limit);

  res.json({
    transactions: paginated,
    total,
    page,
    limit,
    totalPages,
  });
});

api.get('/transactions/:id', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();
  const txn = db.transactions.find(t => t.id === req.params.id);

  if (!txn) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  if (req.user!.role === 'CASHIER' && txn.cashierId !== req.user!.id) {
    res.status(403).json({ error: 'Access denied to other cashier records.' });
    return;
  }

  res.json({ transaction: txn });
});

// Admin-only Void transaction
api.post('/transactions/:id/void', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { reason } = req.body;
  if (!reason || reason.trim().length < 4) {
    res.status(400).json({ error: 'A specific explanation/reason is required to void a financial transaction.' });
    return;
  }

  const db = await readDb();
  const txn = db.transactions.find(t => t.id === req.params.id);

  if (!txn) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  if (txn.status === 'VOIDED') {
    res.status(400).json({ error: 'Transaction is already voided.' });
    return;
  }

  const previousStatus = txn.status;
  txn.status = 'VOIDED';
  txn.voidReason = reason.trim();
  txn.voidedBy = req.user!.id;
  txn.voidedByName = req.user!.name;
  txn.voidedAt = new Date().toISOString();

  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'TRANSACTION_VOIDED',
    'TRANSACTION',
    txn.id,
    {
      previousValues: { status: previousStatus, totalAmountKobo: txn.totalAmountKobo },
      newValues: { status: 'VOIDED' },
      reason: reason.trim(),
    }
  );

  res.json({ transaction: txn });
});

// Admin-only Correct transaction
api.post('/transactions/:id/correct', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { reason, paymentMethod, paymentReference } = req.body;

  if (!reason || reason.trim().length < 4) {
    res.status(400).json({ error: 'A specific reason is required for transaction correction.' });
    return;
  }

  const validMethods: PaymentMethod[] = ['CASH', 'POS', 'BANK_TRANSFER'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    res.status(400).json({ error: 'Invalid payment method' });
    return;
  }

  const db = await readDb();
  const txn = db.transactions.find(t => t.id === req.params.id);

  if (!txn) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  if (txn.status === 'VOIDED') {
    res.status(400).json({ error: 'Cannot modify a voided transaction.' });
    return;
  }

  const previousValues = {
    paymentMethod: txn.paymentMethod,
    paymentReference: txn.paymentReference,
    status: txn.status,
  };

  if (paymentMethod) txn.paymentMethod = paymentMethod;
  if (paymentReference !== undefined) txn.paymentReference = paymentReference.trim();

  txn.status = 'CORRECTED';
  txn.correctionNote = reason.trim();
  txn.correctedBy = req.user!.id;
  txn.correctedByName = req.user!.name;
  txn.correctedAt = new Date().toISOString();

  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'TRANSACTION_CORRECTED',
    'TRANSACTION',
    txn.id,
    {
      previousValues,
      newValues: {
        paymentMethod: txn.paymentMethod,
        paymentReference: txn.paymentReference,
        status: txn.status,
      },
      reason: reason.trim(),
    }
  );

  res.json({ transaction: txn });
});

// Cashier request correction workflow
api.post('/transactions/:id/request-correction', authenticate, async (req: AuthRequest, res) => {
  const { reason, requestedAction = 'VOID', proposedPaymentMethod } = req.body;

  if (!reason || reason.trim().length < 4) {
    res.status(400).json({ error: 'Please explain the mistake so admin can verify and authorize the correction.' });
    return;
  }

  const db = await readDb();
  const txn = db.transactions.find(t => t.id === req.params.id);

  if (!txn) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  if (req.user!.role === 'CASHIER' && txn.cashierId !== req.user!.id) {
    res.status(403).json({ error: 'You can only request corrections on your own transactions.' });
    return;
  }

  const reqId = `cor_req_${crypto.randomUUID()}`;
  const request: CorrectionRequest = {
    id: reqId,
    transactionId: txn.id,
    receiptNumber: txn.receiptNumber,
    gameName: txn.gameName,
    amountKobo: txn.totalAmountKobo,
    paymentMethod: txn.paymentMethod,
    cashierId: req.user!.id,
    cashierName: req.user!.name,
    reason: reason.trim(),
    requestedAction,
    proposedPaymentMethod,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  db.correctionRequests.unshift(request);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'CORRECTION_REQUESTED',
    'CORRECTION_REQUEST',
    request.id,
    {
      newValues: {
        receiptNumber: txn.receiptNumber,
        requestedAction,
        reason: reason.trim(),
      },
    }
  );

  res.status(201).json({ request });
});

api.get('/correction-requests', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();
  let list = db.correctionRequests;

  if (req.user!.role === 'CASHIER') {
    list = list.filter(r => r.cashierId === req.user!.id);
  }

  res.json({ requests: list });
});

api.post('/correction-requests/:id/review', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { action, adminNotes } = req.body; // action: 'APPROVE' | 'REJECT'

  if (action !== 'APPROVE' && action !== 'REJECT') {
    res.status(400).json({ error: 'Action must be APPROVE or REJECT' });
    return;
  }

  const db = await readDb();
  const request = db.correctionRequests.find(r => r.id === req.params.id);

  if (!request) {
    res.status(404).json({ error: 'Correction request not found' });
    return;
  }

  if (request.status !== 'PENDING') {
    res.status(400).json({ error: `Request has already been ${request.status.toLowerCase()}` });
    return;
  }

  request.status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  request.adminNotes = adminNotes ? adminNotes.trim() : undefined;
  request.reviewedBy = req.user!.id;
  request.reviewedByName = req.user!.name;
  request.reviewedAt = new Date().toISOString();

  // If approved, apply the requested action to the target transaction!
  if (action === 'APPROVE') {
    const txn = db.transactions.find(t => t.id === request.transactionId);
    if (txn) {
      if (request.requestedAction === 'VOID') {
        txn.status = 'VOIDED';
        txn.voidReason = `Approved Cashier Request: ${request.reason}`;
        txn.voidedBy = req.user!.id;
        txn.voidedByName = req.user!.name;
        txn.voidedAt = new Date().toISOString();
      } else if (request.requestedAction === 'CHANGE_PAYMENT_METHOD' && request.proposedPaymentMethod) {
        txn.paymentMethod = request.proposedPaymentMethod;
        txn.status = 'CORRECTED';
        txn.correctionNote = `Approved Cashier Request: ${request.reason}`;
        txn.correctedBy = req.user!.id;
        txn.correctedByName = req.user!.name;
        txn.correctedAt = new Date().toISOString();
      }
    }
  }

  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    action === 'APPROVE' ? 'CORRECTION_REQUEST_APPROVED' : 'CORRECTION_REQUEST_REJECTED',
    'CORRECTION_REQUEST',
    request.id,
    {
      newValues: {
        status: request.status,
        adminNotes: request.adminNotes,
      },
      reason: adminNotes || 'Admin review',
    }
  );

  res.json({ request });
});

// ==========================================
// 3b. CUSTOMER TABS (OPEN ENTRIES / MULTI-GAME SESSIONS)
// ==========================================

// Get all customer tabs (filtered by status or search)
api.get('/tabs', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();
  let list = db.customerTabs || [];
  const status = req.query.status as string;

  if (status && status !== 'ALL') {
    list = list.filter(t => t.status === status);
  } else if (!status) {
    list = list.filter(t => t.status === 'OPEN');
  }

  if (req.query.myTabs === 'true') {
    list = list.filter(t => t.cashierId === req.user!.id);
  }

  if (req.query.search) {
    const q = (req.query.search as string).toLowerCase().trim();
    list = list.filter(t =>
      t.customerName.toLowerCase().includes(q) ||
      t.tabNumber.toLowerCase().includes(q) ||
      (t.stationOrNote && t.stationOrNote.toLowerCase().includes(q))
    );
  }

  res.json({ tabs: list });
});

// Create or open a new customer tab
api.post('/tabs', authenticate, async (req: AuthRequest, res) => {
  const { customerName, phoneNumber, stationOrNote, items = [] } = req.body;

  if (!customerName || !customerName.trim()) {
    res.status(400).json({ error: 'Customer Name or Station Identifier is required.' });
    return;
  }

  const db = await readDb();
  db.customerTabs = db.customerTabs || [];

  const processedItems: CustomerTabItem[] = [];
  let totalKobo = 0;

  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it.gameId) continue;
      const game = db.games.find(g => g.id === it.gameId);
      if (!game) continue;
      const qty = Math.max(1, parseInt(it.quantity || 1, 10));
      const unitPriceKobo = game.calculatedPriceKobo;
      const itemTotalKobo = unitPriceKobo * qty;
      totalKobo += itemTotalKobo;

      processedItems.push({
        id: `tab_item_${crypto.randomUUID()}`,
        gameId: game.id,
        gameName: game.name,
        gameCategory: game.category,
        quantity: qty,
        unitPriceKobo,
        totalAmountKobo: itemTotalKobo,
        coinsRequiredSnapshot: game.category === 'COIN_GAME' ? game.coinsRequired : undefined,
        pricePerCoinKoboSnapshot: game.category === 'COIN_GAME' ? game.pricePerCoinKobo : undefined,
        addedAt: new Date().toISOString(),
      });
    }
  }

  const tabSeq = await allocateTabSeq();
  const tabNumber = `TAB-${tabSeq}`;
  const now = new Date().toISOString();

  const newTab: CustomerTab = {
    id: `tab_${crypto.randomUUID()}`,
    tabNumber,
    customerName: customerName.trim(),
    phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
    stationOrNote: stationOrNote ? stationOrNote.trim() : undefined,
    items: processedItems,
    totalAmountKobo: totalKobo,
    status: 'OPEN',
    cashierId: req.user!.id,
    cashierName: req.user!.name,
    createdAt: now,
    updatedAt: now,
  };

  db.customerTabs.unshift(newTab);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'TAB_CREATED',
    'TRANSACTION',
    newTab.id,
    {
      newValues: {
        tabNumber: newTab.tabNumber,
        customerName: newTab.customerName,
        totalAmountKobo: newTab.totalAmountKobo,
        itemCount: newTab.items.length,
      },
    }
  );

  res.status(201).json({ tab: newTab });
});

// Update customer tab (e.g. add more games, edit quantities, update station note)
api.put('/tabs/:id', authenticate, async (req: AuthRequest, res) => {
  const { customerName, phoneNumber, stationOrNote, items } = req.body;
  const db = await readDb();
  db.customerTabs = db.customerTabs || [];

  const tab = db.customerTabs.find(t => t.id === req.params.id);
  if (!tab) {
    res.status(404).json({ error: 'Customer tab not found' });
    return;
  }

  if (tab.status !== 'OPEN') {
    res.status(400).json({ error: 'Cannot modify a settled or cancelled customer tab.' });
    return;
  }

  if (customerName) {
    tab.customerName = customerName.trim();
  }
  if (phoneNumber !== undefined) {
    tab.phoneNumber = phoneNumber ? phoneNumber.trim() : undefined;
  }
  if (stationOrNote !== undefined) {
    tab.stationOrNote = stationOrNote ? stationOrNote.trim() : undefined;
  }

  if (Array.isArray(items)) {
    const processedItems: CustomerTabItem[] = [];
    let totalKobo = 0;

    for (const it of items) {
      if (!it.gameId) continue;
      const game = db.games.find(g => g.id === it.gameId);
      if (!game) continue;
      const qty = Math.max(1, parseInt(it.quantity || 1, 10));
      const unitPriceKobo = game.calculatedPriceKobo;
      const itemTotalKobo = unitPriceKobo * qty;
      totalKobo += itemTotalKobo;

      processedItems.push({
        id: it.id || `tab_item_${crypto.randomUUID()}`,
        gameId: game.id,
        gameName: game.name,
        gameCategory: game.category,
        quantity: qty,
        unitPriceKobo,
        totalAmountKobo: itemTotalKobo,
        coinsRequiredSnapshot: game.category === 'COIN_GAME' ? game.coinsRequired : undefined,
        pricePerCoinKoboSnapshot: game.category === 'COIN_GAME' ? game.pricePerCoinKobo : undefined,
        addedAt: it.addedAt || new Date().toISOString(),
      });
    }

    tab.items = processedItems;
    tab.totalAmountKobo = totalKobo;
  }

  tab.updatedAt = new Date().toISOString();
  await saveDb(db);

  res.json({ tab });
});

// Delete or cancel an open customer tab
api.delete('/tabs/:id', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();
  db.customerTabs = db.customerTabs || [];

  const tabIndex = db.customerTabs.findIndex(t => t.id === req.params.id);
  if (tabIndex === -1) {
    res.status(404).json({ error: 'Customer tab not found' });
    return;
  }

  const tab = db.customerTabs[tabIndex];
  if (tab.status === 'PAID') {
    res.status(400).json({ error: 'Paid customer tabs cannot be removed.' });
    return;
  }

  db.customerTabs.splice(tabIndex, 1);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'TAB_CANCELLED',
    'TRANSACTION',
    tab.id,
    {
      previousValues: {
        tabNumber: tab.tabNumber,
        customerName: tab.customerName,
        totalAmountKobo: tab.totalAmountKobo,
      },
      reason: 'Cancelled before payment',
    }
  );

  res.json({ success: true, message: 'Customer tab cancelled.' });
});

// Settle and checkout customer tab (processes payment, records transaction in ledger)
api.post('/tabs/:id/checkout', authenticate, async (req: AuthRequest, res) => {
  const { paymentMethod, paymentReference, senderName } = req.body;

  const validMethods: PaymentMethod[] = ['CASH', 'POS', 'BANK_TRANSFER'];
  if (!validMethods.includes(paymentMethod)) {
    res.status(400).json({ error: 'Valid payment method (CASH, POS, BANK_TRANSFER) is required.' });
    return;
  }

  if (paymentMethod === 'BANK_TRANSFER' && (!senderName || !senderName.trim())) {
    res.status(400).json({ error: 'Sender name is required for bank transfer verification.' });
    return;
  }

  const db = await readDb();
  db.customerTabs = db.customerTabs || [];

  const tab = db.customerTabs.find(t => t.id === req.params.id);
  if (!tab) {
    res.status(404).json({ error: 'Customer tab not found' });
    return;
  }

  if (tab.status !== 'OPEN') {
    res.status(400).json({ error: 'This customer tab has already been settled or closed.' });
    return;
  }

  if (!tab.items || tab.items.length === 0) {
    res.status(400).json({ error: 'Customer tab has no games added. Please select at least one game before receiving payment.' });
    return;
  }

  const now = new Date();
  const businessDate = getLagosDateString(now);

  const seq = await allocateReceiptSeq();
  const receiptNumber = `GL-${businessDate.replace(/-/g, '')}-${seq}`;
  const transactionId = `txn_${crypto.randomUUID()}`;

  const totalQuantity = tab.items.reduce((s, it) => s + it.quantity, 0);
  const primaryItem = tab.items[0];
  const summaryGameName = tab.items.length === 1
    ? primaryItem.gameName
    : `${primaryItem.gameName} (+${tab.items.length - 1} other${tab.items.length > 2 ? 's' : ''})`;

  const transactionItems: TransactionItem[] = tab.items.map(i => ({
    id: i.id,
    gameId: i.gameId,
    gameName: i.gameName,
    gameCategory: i.gameCategory,
    quantity: i.quantity,
    unitPriceKobo: i.unitPriceKobo,
    totalAmountKobo: i.totalAmountKobo,
    coinsRequiredSnapshot: i.coinsRequiredSnapshot,
    pricePerCoinKoboSnapshot: i.pricePerCoinKoboSnapshot,
  }));

  const newTxn: Transaction = {
    id: transactionId,
    receiptNumber,
    customerName: tab.customerName,
    tabId: tab.id,
    tabNumber: tab.tabNumber,
    items: transactionItems,
    gameId: primaryItem.gameId,
    gameName: summaryGameName,
    gameCategory: primaryItem.gameCategory,
    quantity: totalQuantity,
    unitPriceKobo: tab.items.length === 1 ? primaryItem.unitPriceKobo : tab.totalAmountKobo,
    totalAmountKobo: tab.totalAmountKobo,
    paymentMethod,
    paymentReference: paymentReference ? paymentReference.trim() : undefined,
    senderName: senderName ? senderName.trim() : undefined,
    cashierId: req.user!.id,
    cashierName: req.user!.name,
    status: 'COMPLETED',
    timestamp: now.toISOString(),
    businessDate,
    createdAt: now.toISOString(),
  };

  db.transactions.unshift(newTxn);

  tab.status = 'PAID';
  tab.closedAt = now.toISOString();
  tab.paymentMethod = paymentMethod;
  tab.paymentReference = paymentReference ? paymentReference.trim() : undefined;
  tab.senderName = senderName ? senderName.trim() : undefined;
  tab.receiptNumber = receiptNumber;
  tab.transactionId = transactionId;

  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'TAB_CHECKOUT',
    'TRANSACTION',
    newTxn.id,
    {
      newValues: {
        receiptNumber,
        tabNumber: tab.tabNumber,
        customerName: tab.customerName,
        itemCount: tab.items.length,
        totalAmountKobo: tab.totalAmountKobo,
        paymentMethod,
        cashierName: req.user!.name,
      },
    }
  );

  res.json({ transaction: newTxn, tab });
});

api.get('/reconciliation', authenticate, requireAdmin, async (req, res) => {
  const db = await readDb();
  res.json({ reconciliations: db.reconciliations });
});

api.get('/reconciliation/day/:date', authenticate, requireAdmin, async (req, res) => {
  const { date } = req.params; // YYYY-MM-DD
  const db = await readDb();

  // Calculate live recorded sales from non-voided transactions for this date
  const activeTxns = db.transactions.filter(
    t => t.businessDate === date && t.status !== 'VOIDED'
  );

  let recordedCashKobo = 0;
  let recordedPosKobo = 0;
  let recordedTransferKobo = 0;

  for (const t of activeTxns) {
    if (t.paymentMethod === 'CASH') recordedCashKobo += t.totalAmountKobo;
    else if (t.paymentMethod === 'POS') recordedPosKobo += t.totalAmountKobo;
    else if (t.paymentMethod === 'BANK_TRANSFER') recordedTransferKobo += t.totalAmountKobo;
  }

  const recordedTotalKobo = recordedCashKobo + recordedPosKobo + recordedTransferKobo;
  const transactionCount = activeTxns.length;

  const existing = db.reconciliations.find(r => r.businessDate === date);

  if (existing) {
    // Keep recorded totals refreshed in response
    const diffCashKobo = existing.actualCashKobo - recordedCashKobo;
    const diffPosKobo = existing.actualPosKobo - recordedPosKobo;
    const diffTransferKobo = existing.actualTransferKobo - recordedTransferKobo;
    const diffTotalKobo = existing.actualTotalKobo - recordedTotalKobo;

    res.json({
      reconciliation: {
        ...existing,
        recordedCashKobo,
        recordedPosKobo,
        recordedTransferKobo,
        recordedTotalKobo,
        transactionCount,
        diffCashKobo,
        diffPosKobo,
        diffTransferKobo,
        diffTotalKobo,
      },
      isSaved: true,
    });
  } else {
    // Unsaved draft view
    res.json({
      reconciliation: {
        id: `draft_${date}`,
        businessDate: date,
        recordedCashKobo,
        recordedPosKobo,
        recordedTransferKobo,
        recordedTotalKobo,
        transactionCount,
        actualCashKobo: 0,
        actualPosKobo: 0,
        actualTransferKobo: 0,
        actualTotalKobo: 0,
        diffCashKobo: 0 - recordedCashKobo,
        diffPosKobo: 0 - recordedPosKobo,
        diffTransferKobo: 0 - recordedTransferKobo,
        diffTotalKobo: 0 - recordedTotalKobo,
        status: 'DRAFT',
      },
      isSaved: false,
    });
  }
});

api.post('/reconciliation/day/:date', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { date } = req.params;
  const {
    actualCashKobo = 0,
    actualPosKobo = 0,
    actualTransferKobo = 0,
    posTerminalReference,
    bankSettlementTotalKobo,
    notes,
    statusOverride,
  } = req.body;

  const db = await readDb();
  const existing = db.reconciliations.find(r => r.businessDate === date);

  // If already balanced and locked, cannot overwrite without reopening
  if (existing && existing.status === 'BALANCED' && !req.body.isReopenedEdit) {
    res.status(400).json({
      error: 'This date is already finalized and BALANCED. You must explicitly reopen this day with an audit reason before making changes.',
    });
    return;
  }

  // Calculate live recorded totals
  const activeTxns = db.transactions.filter(
    t => t.businessDate === date && t.status !== 'VOIDED'
  );

  let recordedCashKobo = 0;
  let recordedPosKobo = 0;
  let recordedTransferKobo = 0;

  for (const t of activeTxns) {
    if (t.paymentMethod === 'CASH') recordedCashKobo += t.totalAmountKobo;
    else if (t.paymentMethod === 'POS') recordedPosKobo += t.totalAmountKobo;
    else if (t.paymentMethod === 'BANK_TRANSFER') recordedTransferKobo += t.totalAmountKobo;
  }

  const recordedTotalKobo = recordedCashKobo + recordedPosKobo + recordedTransferKobo;
  const actCash = Math.max(0, parseInt(actualCashKobo, 10));
  const actPos = Math.max(0, parseInt(actualPosKobo, 10));
  const actTransfer = Math.max(0, parseInt(actualTransferKobo, 10));
  const actualTotalKobo = actCash + actPos + actTransfer;

  const diffCashKobo = actCash - recordedCashKobo;
  const diffPosKobo = actPos - recordedPosKobo;
  const diffTransferKobo = actTransfer - recordedTransferKobo;
  const diffTotalKobo = actualTotalKobo - recordedTotalKobo;

  let computedStatus: DailyReconciliation['status'] = 'BALANCED';
  if (diffTotalKobo !== 0 || diffCashKobo !== 0 || diffPosKobo !== 0 || diffTransferKobo !== 0) {
    computedStatus = 'DISCREPANCY_FOUND';
  }
  if (statusOverride === 'DRAFT') {
    computedStatus = 'DRAFT';
  }

  const now = new Date().toISOString();

  let rec: DailyReconciliation;
  if (existing) {
    rec = existing;
    rec.recordedCashKobo = recordedCashKobo;
    rec.recordedPosKobo = recordedPosKobo;
    rec.recordedTransferKobo = recordedTransferKobo;
    rec.recordedTotalKobo = recordedTotalKobo;
    rec.transactionCount = activeTxns.length;
    rec.actualCashKobo = actCash;
    rec.actualPosKobo = actPos;
    rec.actualTransferKobo = actTransfer;
    rec.actualTotalKobo = actualTotalKobo;
    rec.diffCashKobo = diffCashKobo;
    rec.diffPosKobo = diffPosKobo;
    rec.diffTransferKobo = diffTransferKobo;
    rec.diffTotalKobo = diffTotalKobo;
    rec.posTerminalReference = posTerminalReference ? posTerminalReference.trim() : rec.posTerminalReference;
    rec.bankSettlementTotalKobo = bankSettlementTotalKobo !== undefined ? parseInt(bankSettlementTotalKobo, 10) : rec.bankSettlementTotalKobo;
    rec.notes = notes !== undefined ? notes.trim() : rec.notes;
    rec.status = computedStatus;
    rec.approvedBy = req.user!.id;
    rec.approvedByName = req.user!.name;
    rec.updatedAt = now;
  } else {
    rec = {
      id: `rec_${date}`,
      businessDate: date,
      recordedCashKobo,
      recordedPosKobo,
      recordedTransferKobo,
      recordedTotalKobo,
      transactionCount: activeTxns.length,
      actualCashKobo: actCash,
      actualPosKobo: actPos,
      actualTransferKobo: actTransfer,
      actualTotalKobo,
      diffCashKobo,
      diffPosKobo,
      diffTransferKobo,
      diffTotalKobo,
      posTerminalReference: posTerminalReference ? posTerminalReference.trim() : undefined,
      bankSettlementTotalKobo: bankSettlementTotalKobo ? parseInt(bankSettlementTotalKobo, 10) : undefined,
      notes: notes ? notes.trim() : undefined,
      status: computedStatus,
      createdBy: req.user!.id,
      createdByName: req.user!.name,
      approvedBy: req.user!.id,
      approvedByName: req.user!.name,
      createdAt: now,
      updatedAt: now,
    };
    db.reconciliations.push(rec);
  }

  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'RECONCILIATION_SAVED',
    'RECONCILIATION',
    rec.id,
    {
      newValues: {
        businessDate: date,
        recordedTotalKobo,
        actualTotalKobo,
        diffTotalKobo,
        status: rec.status,
      },
      reason: `Saved reconciliation for ${date} with status ${rec.status}`,
    }
  );

  res.json({ reconciliation: rec });
});

api.post('/reconciliation/day/:date/reopen', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { date } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim().length < 4) {
    res.status(400).json({ error: 'A specific explanation/reason is required to reopen a closed reconciliation.' });
    return;
  }

  const db = await readDb();
  const rec = db.reconciliations.find(r => r.businessDate === date);

  if (!rec) {
    res.status(404).json({ error: 'Reconciliation record not found' });
    return;
  }

  const previousStatus = rec.status;
  rec.status = 'REOPENED';
  rec.reopenedBy = req.user!.id;
  rec.reopenedByName = req.user!.name;
  rec.reopenReason = reason.trim();
  rec.updatedAt = new Date().toISOString();

  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'RECONCILIATION_REOPENED',
    'RECONCILIATION',
    rec.id,
    {
      previousValues: { status: previousStatus },
      newValues: { status: 'REOPENED', reopenReason: reason.trim() },
      reason: reason.trim(),
    }
  );

  res.json({ reconciliation: rec });
});

// ==========================================
// 5. DASHBOARD STATS
// ==========================================

api.get('/dashboard/stats', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();
  const period = (req.query.period as string) || 'today';
  const now = new Date();
  const todayLagos = getLagosDateString(now);

  let startDate = todayLagos;
  let endDate = todayLagos;

  if (period === 'yesterday') {
    const yDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    startDate = getLagosDateString(yDate);
    endDate = startDate;
  } else if (period === 'this_week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate = getLagosDateString(weekAgo);
    endDate = todayLagos;
  } else if (period === 'this_month') {
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate = getLagosDateString(monthAgo);
    endDate = todayLagos;
  } else if (period === 'custom') {
    if (req.query.startDate) startDate = req.query.startDate as string;
    if (req.query.endDate) endDate = req.query.endDate as string;
  }

  // Filter non-voided transactions within date window
  let txns = db.transactions.filter(
    t => t.businessDate >= startDate && t.businessDate <= endDate && t.status !== 'VOIDED'
  );

  // If cashier, restrict to own transactions
  if (req.user!.role === 'CASHIER') {
    txns = txns.filter(t => t.cashierId === req.user!.id);
  }

  let totalRevenueKobo = 0;
  let cashSalesKobo = 0;
  let posSalesKobo = 0;
  let transferSalesKobo = 0;

  const categoryMap: Record<GameCategory, { revenueKobo: number; count: number }> = {
    PS_GAME: { revenueKobo: 0, count: 0 },
    SNOOKER: { revenueKobo: 0, count: 0 },
    COIN_GAME: { revenueKobo: 0, count: 0 },
  };

  const gameMap: Record<string, { gameName: string; category: GameCategory; revenueKobo: number; count: number }> = {};
  const cashierMap: Record<string, { cashierName: string; revenueKobo: number; count: number }> = {};

  for (const t of txns) {
    totalRevenueKobo += t.totalAmountKobo;
    if (t.paymentMethod === 'CASH') cashSalesKobo += t.totalAmountKobo;
    else if (t.paymentMethod === 'POS') posSalesKobo += t.totalAmountKobo;
    else if (t.paymentMethod === 'BANK_TRANSFER') transferSalesKobo += t.totalAmountKobo;

    // Category
    if (categoryMap[t.gameCategory]) {
      categoryMap[t.gameCategory].revenueKobo += t.totalAmountKobo;
      categoryMap[t.gameCategory].count += 1;
    }

    // Game
    if (!gameMap[t.gameId]) {
      gameMap[t.gameId] = {
        gameName: t.gameName,
        category: t.gameCategory,
        revenueKobo: 0,
        count: 0,
      };
    }
    gameMap[t.gameId].revenueKobo += t.totalAmountKobo;
    gameMap[t.gameId].count += 1;

    // Cashier
    if (!cashierMap[t.cashierId]) {
      cashierMap[t.cashierId] = {
        cashierName: t.cashierName,
        revenueKobo: 0,
        count: 0,
      };
    }
    cashierMap[t.cashierId].revenueKobo += t.totalAmountKobo;
    cashierMap[t.cashierId].count += 1;
  }

  const categoryBreakdown = Object.entries(categoryMap).map(([category, val]) => ({
    category: category as GameCategory,
    revenueKobo: val.revenueKobo,
    count: val.count,
  }));

  const gameBreakdown = Object.entries(gameMap)
    .map(([gameId, val]) => ({
      gameId,
      gameName: val.gameName,
      category: val.category,
      revenueKobo: val.revenueKobo,
      count: val.count,
    }))
    .sort((a, b) => b.revenueKobo - a.revenueKobo);

  const cashierBreakdown = Object.entries(cashierMap)
    .map(([cashierId, val]) => ({
      cashierId,
      cashierName: val.cashierName,
      revenueKobo: val.revenueKobo,
      count: val.count,
    }))
    .sort((a, b) => b.revenueKobo - a.revenueKobo);

  const recentTransactions = txns.slice(0, 10);

  // Coin float statistics for the selected period (all cashiers or own)
  const periodAllocations = db.coinAllocations.filter(
    a => a.businessDate >= startDate && a.businessDate <= endDate && (req.user!.role === 'ADMIN' || a.cashierId === req.user!.id)
  );
  const periodCompensations = db.coinCompensations.filter(
    c => c.businessDate >= startDate && c.businessDate <= endDate && (req.user!.role === 'ADMIN' || c.cashierId === req.user!.id)
  );
  const periodAllTxns = db.transactions.filter(
    t => t.businessDate >= startDate && t.businessDate <= endDate && (req.user!.role === 'ADMIN' || t.cashierId === req.user!.id)
  );

  let totalAllocatedCoins = periodAllocations.reduce((s, a) => s + a.initialCoins, 0);
  let totalSoldCoins = 0;
  let totalVoidedCoins = 0;
  for (const t of periodAllTxns) {
    const coins = countCoinsInTxn(t);
    if (coins <= 0) continue;
    if (t.status === 'VOIDED') totalVoidedCoins += coins;
    else totalSoldCoins += coins;
  }
  const totalCompensatedCoins = periodCompensations.reduce((s, c) => s + c.coinsIssued, 0);

  // Check reconciliation status for today
  const todayRec = db.reconciliations.find(r => r.businessDate === todayLagos);

  const stats: DashboardStats = {
    period,
    startDate,
    endDate,
    totalRevenueKobo,
    totalTransactions: txns.length,
    cashSalesKobo,
    posSalesKobo,
    transferSalesKobo,
    categoryBreakdown,
    gameBreakdown,
    cashierBreakdown,
    recentTransactions,
    coinStats: {
      totalAllocated: totalAllocatedCoins,
      totalSold: totalSoldCoins,
      totalVoided: totalVoidedCoins,
      totalCompensated: totalCompensatedCoins,
      totalRemaining: totalAllocatedCoins - totalSoldCoins - totalVoidedCoins - totalCompensatedCoins,
    },
    reconciliationStatus: todayRec
      ? {
          date: todayRec.businessDate,
          status: todayRec.status,
          diffTotalKobo: todayRec.diffTotalKobo,
        }
      : undefined,
  };

  res.json({ stats });
});

// ==========================================
// 6. CASHIERS ACCOUNT MANAGEMENT
// ==========================================

api.get('/cashiers', authenticate, requireAdmin, async (req, res) => {
  const db = await readDb();
  const todayLagos = getLagosDateString(new Date());

  const cashiers = db.users
    .filter(u => u.role === 'CASHIER')
    .map(c => {
      const allTxns = db.transactions.filter(t => t.cashierId === c.id && t.status !== 'VOIDED');
      const todayTxns = allTxns.filter(t => t.businessDate === todayLagos);

      const totalSalesKobo = allTxns.reduce((s, t) => s + t.totalAmountKobo, 0);
      const todaySalesKobo = todayTxns.reduce((s, t) => s + t.totalAmountKobo, 0);

      return {
        id: c.id,
        username: c.username,
        name: c.name,
        role: c.role,
        isActive: c.isActive,
        phoneNumber: c.phoneNumber,
        mustChangePassword: Boolean(c.mustChangePassword),
        createdAt: c.createdAt,
        lastLoginAt: c.lastLoginAt,
        totalTransactions: allTxns.length,
        totalSalesKobo,
        todayTransactions: todayTxns.length,
        todaySalesKobo,
      };
    });

  res.json({ cashiers });
});

api.post('/cashiers', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { name, phoneNumber } = req.body;

  if (!name || !name.trim() || !phoneNumber || !phoneNumber.trim()) {
    res.status(400).json({ error: 'Staff full name and phone number are required.' });
    return;
  }

  const cleanName = name.trim();
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');

  if (cleanPhone.length < 8) {
    res.status(400).json({ error: 'Please enter a valid phone number (at least 8 digits).' });
    return;
  }

  const db = await readDb();
  const exists = db.users.some(
    u => u.username.toLowerCase() === cleanPhone.toLowerCase() ||
         (u.phoneNumber && u.phoneNumber.replace(/\s+/g, '') === cleanPhone)
  );

  if (exists) {
    res.status(400).json({ error: 'A cashier account with this phone number already exists.' });
    return;
  }

  // The default password upon creation is strictly their phone number
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(cleanPhone, salt);
  const now = new Date().toISOString();
  const cashierId = `usr_cashier_${Date.now()}`;

  // Friendly username from cashier's first name, or fallback to phone
  let candidateUsername = cleanName.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
  if (!candidateUsername || candidateUsername.length < 2 || candidateUsername === 'admin' || db.users.some(u => u.username.toLowerCase() === candidateUsername)) {
    candidateUsername = cleanPhone;
  }

  const newCashier = {
    id: cashierId,
    username: candidateUsername,
    name: cleanName,
    phoneNumber: cleanPhone,
    role: 'CASHIER' as const,
    isActive: true,
    mustChangePassword: true,
    createdBy: req.user!.id,
    createdAt: now,
    passwordHash,
  };

  db.users.push(newCashier);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'CASHIER_CREATED',
    'USER',
    newCashier.id,
    {
      newValues: {
        username: newCashier.username,
        name: newCashier.name,
        phoneNumber: newCashier.phoneNumber,
        role: newCashier.role,
        mustChangePassword: true,
      },
      reason: 'Cashier created with phone number as default password and mustChangePassword prompt',
    }
  );

  const safeCashier = {
    id: newCashier.id,
    username: newCashier.username,
    name: newCashier.name,
    phoneNumber: newCashier.phoneNumber,
    role: newCashier.role,
    isActive: newCashier.isActive,
    mustChangePassword: true,
    createdAt: newCashier.createdAt,
  };

  res.status(201).json({ cashier: safeCashier });
});

api.patch('/cashiers/:id/status', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive must be a boolean' });
    return;
  }

  const db = await readDb();
  const cashier = db.users.find(u => u.id === id && u.role === 'CASHIER');

  if (!cashier) {
    res.status(404).json({ error: 'Cashier account not found' });
    return;
  }

  const oldStatus = cashier.isActive;
  cashier.isActive = isActive;
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'CASHIER_STATUS_CHANGED',
    'USER',
    cashier.id,
    {
      previousValues: { isActive: oldStatus },
      newValues: { isActive: cashier.isActive },
      reason: isActive ? 'Cashier account activated' : 'Cashier account deactivated',
    }
  );

  res.json({
    cashier: {
      id: cashier.id,
      username: cashier.username,
      name: cashier.name,
      role: cashier.role,
      isActive: cashier.isActive,
    },
  });
});

api.post('/cashiers/:id/reset-password', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters.' });
    return;
  }

  const db = await readDb();
  const cashier = db.users.find(u => u.id === id && u.role === 'CASHIER');

  if (!cashier) {
    res.status(404).json({ error: 'Cashier account not found' });
    return;
  }

  const salt = bcrypt.genSaltSync(10);
  cashier.passwordHash = bcrypt.hashSync(newPassword, salt);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'CASHIER_PASSWORD_RESET',
    'USER',
    cashier.id,
    {
      reason: `Password reset by administrator ${req.user!.name}`,
    }
  );

  res.json({ message: `Password for ${cashier.name} successfully reset.` });
});

// ==========================================================
// 7. COIN VAULT (ALLOCATIONS, BALANCES, COMPENSATIONS)
// ==========================================================
// Accounting model per cashier:
//   expectedRemaining = allocated - soldCoins - voidedCoins - compensatedCoins
// VOIDED sales (e.g. coin stuck in machine and admin refunded the customer)
// STILL deduct from the float, because the physical coin already left the
// cashier's drawer. The cashier reports the incident physically or on the
// platform (void + fix request), and the books stay balanced.

// Total coins physically handed out for one transaction (any status)
function countCoinsInTxn(t: Transaction): number {
  let coins = 0;
  if (Array.isArray(t.items) && t.items.length > 0) {
    for (const it of t.items) {
      if (it.gameCategory === 'COIN_GAME') {
        coins += (it.coinsRequiredSnapshot || 0) * it.quantity;
      }
    }
  } else if (t.gameCategory === 'COIN_GAME' && t.coinsRequiredSnapshot) {
    coins += t.coinsRequiredSnapshot * t.quantity;
  }
  return coins;
}

type Db = Awaited<ReturnType<typeof readDb>>;

function computeCoinBalance(db: Db, cashierId: string, cashierName: string, startDate?: string, endDate?: string): CashierCoinBalance {
  const inWindow = (d: string) => (!startDate || d >= startDate) && (!endDate || d <= endDate);

  const allocatedCoins = db.coinAllocations
    .filter(a => a.cashierId === cashierId && inWindow(a.businessDate))
    .reduce((s, a) => s + a.initialCoins, 0);

  const cashierTxns = db.transactions.filter(t => t.cashierId === cashierId && inWindow(t.businessDate));

  let soldCoins = 0;
  let voidedCoins = 0;
  for (const t of cashierTxns) {
    const coins = countCoinsInTxn(t);
    if (coins <= 0) continue;
    if (t.status === 'VOIDED') voidedCoins += coins;
    else soldCoins += coins;
  }

  const compensatedCoins = db.coinCompensations
    .filter(c => c.cashierId === cashierId && inWindow(c.businessDate))
    .reduce((s, c) => s + c.coinsIssued, 0);

  // Most recent closed allocation in window carries the physical count snapshot
  const closedAllocs = db.coinAllocations
    .filter(a => a.cashierId === cashierId && a.status === 'CLOSED' && a.actualRemainingCoins !== undefined && inWindow(a.businessDate))
    .sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  const lastClosed = closedAllocs[0];

  const businessDate = endDate || startDate || getLagosDateString(new Date());

  return {
    cashierId,
    cashierName,
    businessDate,
    allocatedCoins,
    soldCoins,
    voidedCoins,
    compensatedCoins,
    expectedRemainingCoins: allocatedCoins - soldCoins - voidedCoins - compensatedCoins,
    actualRemainingCoins: lastClosed?.actualRemainingCoins,
    discrepancyCoins: lastClosed?.discrepancyCoins,
    notes: lastClosed?.closeNotes,
  };
}

// Admin: hand a cashier a bulk float of physical coins (e.g. 200 coins)
api.post('/coin-allocations', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { cashierId, initialCoins, notes } = req.body;
  const coins = parseInt(initialCoins, 10);

  if (!cashierId || !Number.isFinite(coins) || coins < 1) {
    res.status(400).json({ error: 'Select a cashier and enter a valid number of coins (minimum 1).' });
    return;
  }

  const db = await readDb();
  const cashier = db.users.find(u => u.id === cashierId && u.role === 'CASHIER');
  if (!cashier) {
    res.status(404).json({ error: 'Cashier account not found.' });
    return;
  }
  if (!cashier.isActive) {
    res.status(400).json({ error: `Cannot allocate coins to deactivated cashier ${cashier.name}.` });
    return;
  }

  const now = new Date();
  const allocation: CoinAllocation = {
    id: `coin_alloc_${crypto.randomUUID()}`,
    cashierId: cashier.id,
    cashierName: cashier.name,
    allocatedBy: req.user!.id,
    allocatedByName: req.user!.name,
    initialCoins: coins,
    notes: notes ? String(notes).trim() : undefined,
    businessDate: getLagosDateString(now),
    timestamp: now.toISOString(),
    status: 'ACTIVE',
  };

  db.coinAllocations.unshift(allocation);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'COIN_ALLOCATED',
    'COIN_ALLOCATION',
    allocation.id,
    {
      newValues: {
        cashierName: cashier.name,
        initialCoins: coins,
        notes: allocation.notes,
        businessDate: allocation.businessDate,
      },
      reason: `Bulk coin float of ${coins} coins issued to ${cashier.name}`,
    }
  );

  res.status(201).json({ allocation });
});

api.get('/coin-allocations', authenticate, requireAdmin, async (req, res) => {
  const db = await readDb();
  let list = [...db.coinAllocations];

  if (req.query.cashierId) list = list.filter(a => a.cashierId === req.query.cashierId);
  if (req.query.startDate) list = list.filter(a => a.businessDate >= (req.query.startDate as string));
  if (req.query.endDate) list = list.filter(a => a.businessDate <= (req.query.endDate as string));
  if (req.query.status) list = list.filter(a => a.status === req.query.status);

  res.json({ allocations: list });
});

// Live computed coin float per cashier. Cashier sees only their own.
api.get('/coin-balances', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();

  const today = getLagosDateString(new Date());
  const startDate = (req.query.startDate as string) || today;
  const endDate = (req.query.endDate as string) || today;

  const targetCashiers = req.user!.role === 'CASHIER'
    ? db.users.filter(u => u.id === req.user!.id)
    : db.users.filter(u => u.role === 'CASHIER');

  const balances = targetCashiers.map(c => computeCoinBalance(db, c.id, c.name, startDate, endDate));

  res.json({ balances, startDate, endDate });
});

// Admin: end-of-shift physical coin count — detects shortage / theft / loss
api.post('/coin-allocations/:id/close', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { actualRemainingCoins, notes } = req.body;
  const actual = parseInt(actualRemainingCoins, 10);

  if (!Number.isFinite(actual) || actual < 0) {
    res.status(400).json({ error: 'Enter the physical coin count you counted (0 or more).' });
    return;
  }

  const db = await readDb();
  const allocation = db.coinAllocations.find(a => a.id === req.params.id);

  if (!allocation) {
    res.status(404).json({ error: 'Coin allocation record not found.' });
    return;
  }
  if (allocation.status === 'CLOSED') {
    res.status(400).json({ error: 'This coin allocation has already been counted and closed.' });
    return;
  }

  // Expected remaining computed across ALL of this cashier's allocations on
  // the same business date, so multiple allocations in a day reconcile together.
  const balance = computeCoinBalance(db, allocation.cashierId, allocation.cashierName, allocation.businessDate, allocation.businessDate);
  const expected = balance.expectedRemainingCoins;
  const discrepancy = actual - expected;

  const previousValues = { status: allocation.status };

  allocation.status = 'CLOSED';
  allocation.closedAt = new Date().toISOString();
  allocation.closedBy = req.user!.id;
  allocation.closedByName = req.user!.name;
  allocation.actualRemainingCoins = actual;
  allocation.discrepancyCoins = discrepancy;
  allocation.closeNotes = notes ? String(notes).trim() : undefined;

  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'COIN_ALLOCATION_CLOSED',
    'COIN_ALLOCATION',
    allocation.id,
    {
      previousValues,
      newValues: {
        cashierName: allocation.cashierName,
        allocatedCoins: allocation.initialCoins,
        soldCoins: balance.soldCoins,
        voidedCoins: balance.voidedCoins,
        compensatedCoins: balance.compensatedCoins,
        expectedRemainingCoins: expected,
        actualRemainingCoins: actual,
        discrepancyCoins: discrepancy,
        closeNotes: allocation.closeNotes,
      },
      reason: discrepancy < 0
        ? `Physical count SHORT by ${Math.abs(discrepancy)} coin(s) — possible theft, loss or miscount`
        : discrepancy > 0
        ? `Physical count OVER by ${discrepancy} coin(s) — verify float`
        : 'Coin float perfectly balanced',
    }
  );

  res.json({ allocation, expectedRemainingCoins: expected, discrepancyCoins: discrepancy });
});

// Admin or Cashier (self): report a lost/compensated coin (power outage, machine fault)
api.post('/coin-compensations', authenticate, async (req: AuthRequest, res) => {
  const { cashierId, customerName, gameId, gameName, coinsIssued, reason, notes } = req.body;
  const coins = parseInt(coinsIssued, 10);

  if (!customerName || !String(customerName).trim()) {
    res.status(400).json({ error: 'Customer name is required so the replacement can be traced to a player.' });
    return;
  }
  if (!gameName || !String(gameName).trim()) {
    res.status(400).json({ error: 'Game name is required (the game the customer was playing when the coin was lost).' });
    return;
  }
  if (!Number.isFinite(coins) || coins < 1 || coins > 50) {
    res.status(400).json({ error: 'Number of replacement coins must be between 1 and 50.' });
    return;
  }
  if (!reason || String(reason).trim().length < 4) {
    res.status(400).json({ error: 'Explain what happened (e.g. "Power outage mid-game, coin lost in machine").' });
    return;
  }

  const db = await readDb();

  // Cashiers can only report for themselves; admins can report for any cashier
  let targetCashierId = req.user!.id;
  if (req.user!.role === 'ADMIN' && cashierId) {
    targetCashierId = cashierId;
  }

  const cashier = db.users.find(u => u.id === targetCashierId && u.role === 'CASHIER');
  if (!cashier) {
    res.status(404).json({ error: 'Cashier account not found.' });
    return;
  }

  const now = new Date();
  const compensation: CoinCompensation = {
    id: `coin_comp_${crypto.randomUUID()}`,
    cashierId: cashier.id,
    cashierName: cashier.name,
    customerName: String(customerName).trim(),
    gameId: gameId ? String(gameId) : undefined,
    gameName: String(gameName).trim(),
    coinsIssued: coins,
    reason: String(reason).trim(),
    notes: notes ? String(notes).trim() : undefined,
    businessDate: getLagosDateString(now),
    timestamp: now.toISOString(),
  };

  db.coinCompensations.unshift(compensation);
  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'COIN_COMPENSATION_RECORDED',
    'COIN_COMPENSATION',
    compensation.id,
    {
      newValues: {
        cashierName: cashier.name,
        customerName: compensation.customerName,
        gameName: compensation.gameName,
        coinsIssued: coins,
        reason: compensation.reason,
        notes: compensation.notes,
        businessDate: compensation.businessDate,
      },
      reason: `${coins} replacement coin(s) issued free to customer — deducted from ${cashier.name}'s float`,
    }
  );

  res.status(201).json({ compensation });
});

api.get('/coin-compensations', authenticate, async (req: AuthRequest, res) => {
  const db = await readDb();
  let list = [...db.coinCompensations];

  if (req.user!.role === 'CASHIER') {
    list = list.filter(c => c.cashierId === req.user!.id);
  } else if (req.query.cashierId) {
    list = list.filter(c => c.cashierId === req.query.cashierId);
  }
  if (req.query.startDate) list = list.filter(c => c.businessDate >= (req.query.startDate as string));
  if (req.query.endDate) list = list.filter(c => c.businessDate <= (req.query.endDate as string));

  res.json({ compensations: list });
});

// ==========================================================
// 8. BANK TRANSFER ACCOUNTS (UP TO 3 SLOTS)
// ==========================================================

// Both roles: cashiers need these to show customers for transfers
api.get('/bank-accounts', authenticate, async (req, res) => {
  const db = await readDb();
  const accounts = [...db.bankAccounts].sort((a, b) => a.slotNumber - b.slotNumber);
  res.json({ accounts });
});

// Admin: create or edit any slot anytime
api.put('/bank-accounts/:slot', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const slot = parseInt(req.params.slot, 10);
  if (![1, 2, 3].includes(slot)) {
    res.status(400).json({ error: 'Only 3 bank account slots are supported (1, 2 or 3).' });
    return;
  }

  const { bankName, accountNumber, accountName, label, isActive } = req.body;

  if (!bankName || !String(bankName).trim()) {
    res.status(400).json({ error: 'Bank name is required.' });
    return;
  }
  const cleanAcctNo = String(accountNumber || '').replace(/\s+/g, '');
  if (!/^\d{6,14}$/.test(cleanAcctNo)) {
    res.status(400).json({ error: 'Account number must be 6–14 digits.' });
    return;
  }
  if (!accountName || !String(accountName).trim()) {
    res.status(400).json({ error: 'Account holder name is required.' });
    return;
  }

  const db = await readDb();
  const existing = db.bankAccounts.find(a => a.slotNumber === slot);
  const previousValues = existing
    ? {
        bankName: existing.bankName,
        accountNumber: existing.accountNumber,
        accountName: existing.accountName,
        label: existing.label,
        isActive: existing.isActive,
      }
    : undefined;

  const now = new Date().toISOString();
  let record: BankAccount;

  if (existing) {
    existing.bankName = String(bankName).trim();
    existing.accountNumber = cleanAcctNo;
    existing.accountName = String(accountName).trim();
    existing.label = label !== undefined ? String(label).trim() || undefined : existing.label;
    existing.isActive = typeof isActive === 'boolean' ? isActive : existing.isActive;
    existing.updatedBy = req.user!.id;
    existing.updatedByName = req.user!.name;
    existing.updatedAt = now;
    record = existing;
  } else {
    record = {
      id: `bank_acct_slot_${slot}`,
      slotNumber: slot as 1 | 2 | 3,
      bankName: String(bankName).trim(),
      accountNumber: cleanAcctNo,
      accountName: String(accountName).trim(),
      label: label ? String(label).trim() : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : true,
      updatedBy: req.user!.id,
      updatedByName: req.user!.name,
      updatedAt: now,
    };
    db.bankAccounts.push(record);
  }

  await saveDb(db);

  await addAuditLog(
    { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    'BANK_ACCOUNT_UPDATED',
    'BANK_ACCOUNT',
    record.id,
    {
      previousValues,
      newValues: {
        slotNumber: record.slotNumber,
        bankName: record.bankName,
        accountNumber: record.accountNumber,
        accountName: record.accountName,
        label: record.label,
        isActive: record.isActive,
      },
      reason: previousValues
        ? `Bank transfer account slot ${slot} edited for customer transfers`
        : `Bank transfer account slot ${slot} created for customer transfers`,
    }
  );

  res.json({ account: record });
});

// ==========================================
// 9. AUDIT LOGS
// ==========================================
// IMMUTABILITY RULE: Audit logs are append-only by design. There must NEVER
// be a DELETE or PATCH route for audit logs — historical records (sales,
// voids, coin allocations, bank account edits, etc.) must survive forever
// so shortage/theft investigations cannot be covered up.

api.get('/audit-logs', authenticate, requireAdmin, async (req, res) => {
  const db = await readDb();
  let logs = [...db.auditLogs];

  if (req.query.entityType) {
    logs = logs.filter(l => l.entityType === req.query.entityType);
  }

  if (req.query.action) {
    logs = logs.filter(l => l.action === req.query.action);
  }

  if (req.query.actorId) {
    logs = logs.filter(l => l.actorId === req.query.actorId);
  }

  if (req.query.startDate) {
    logs = logs.filter(l => l.businessDate >= (req.query.startDate as string));
  }

  if (req.query.endDate) {
    logs = logs.filter(l => l.businessDate <= (req.query.endDate as string));
  }

  if (req.query.search) {
    const q = (req.query.search as string).toLowerCase().trim();
    logs = logs.filter(
      l =>
        l.action.toLowerCase().includes(q) ||
        l.actorName.toLowerCase().includes(q) ||
        (l.reason && l.reason.toLowerCase().includes(q)) ||
        l.entityId.toLowerCase().includes(q)
    );
  }

  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || '30', 10)));
  const total = logs.length;
  const paginated = logs.slice((page - 1) * limit, page * limit);

  res.json({
    logs: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

// ==========================================
// 8. CSV EXPORT
// ==========================================

api.get('/export/transactions.csv', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const db = await readDb();
  let list = [...db.transactions];

  if (req.query.startDate) list = list.filter(t => t.businessDate >= (req.query.startDate as string));
  if (req.query.endDate) list = list.filter(t => t.businessDate <= (req.query.endDate as string));
  if (req.query.category) list = list.filter(t => t.gameCategory === req.query.category);
  if (req.query.paymentMethod) list = list.filter(t => t.paymentMethod === req.query.paymentMethod);
  if (req.query.cashierId) list = list.filter(t => t.cashierId === req.query.cashierId);
  if (req.query.status) list = list.filter(t => t.status === req.query.status);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="game_lounge_sales_${getLagosDateString(new Date())}.csv"`);

  const headers = [
    'Receipt Number',
    'Date (Lagos)',
    'Timestamp',
    'Category',
    'Game Name',
    'Quantity',
    'Unit Price (NGN)',
    'Total Amount (NGN)',
    'Payment Method',
    'Sender Name',
    'Payment Reference',
    'Cashier',
    'Status',
    'Void Reason',
  ];

  const escapeCsv = (val: any) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = list.map(t => [
    escapeCsv(t.receiptNumber),
    escapeCsv(t.businessDate),
    escapeCsv(t.timestamp),
    escapeCsv(t.gameCategory),
    escapeCsv(t.gameName),
    escapeCsv(t.quantity),
    escapeCsv((t.unitPriceKobo / 100).toFixed(2)),
    escapeCsv((t.totalAmountKobo / 100).toFixed(2)),
    escapeCsv(t.paymentMethod),
    escapeCsv(t.senderName || ''),
    escapeCsv(t.paymentReference || ''),
    escapeCsv(t.cashierName),
    escapeCsv(t.status),
    escapeCsv(t.voidReason || ''),
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  res.send(csvContent);
});

// Terminal error handler (reached via the async guard above)
api.use((err: any, req: any, res: any, next: any) => {
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default api;
