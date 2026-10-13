import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  collection,
  runTransaction,
} from 'firebase/firestore';
import {
  User,
  Game,
  Transaction,
  CustomerTab,
  DailyReconciliation,
  CorrectionRequest,
  AuditLog,
  CoinAllocation,
  CoinCompensation,
  BankAccount,
} from '../src/types/index.ts';

export interface DbSchema {
  users: (User & { passwordHash: string })[];
  games: Game[];
  transactions: Transaction[];
  customerTabs: CustomerTab[];
  reconciliations: DailyReconciliation[];
  correctionRequests: CorrectionRequest[];
  coinAllocations: CoinAllocation[];
  coinCompensations: CoinCompensation[];
  bankAccounts: BankAccount[];
  auditLogs: AuditLog[];
  meta: {
    initialized: boolean;
    version: number;
    lastReceiptSeq: number;
    lastTabSeq?: number;
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure directory exists for db.json backup
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Format date in Africa/Lagos timezone (YYYY-MM-DD)
export function getLagosDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // e.g. "2026-10-12"
}

export function getLagosIsoString(date: Date = new Date()): string {
  return date.toISOString();
}

let firestoreInstance: Firestore | null = null;

export function getFirestore(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const app = getApps().length === 0 ? initializeApp(cfg) : getApp();
    firestoreInstance = initializeFirestore(app, { ignoreUndefinedProperties: true }, cfg.firestoreDatabaseId);
    return firestoreInstance;
  }
  throw new Error('firebase-applet-config.json not found for Firestore initialization');
}

export function cleanDoc<T>(obj: T): any {
  return JSON.parse(JSON.stringify(obj));
}

let dbCache: DbSchema | null = null;
let isMigratedOrLoaded = false;
let syncInProgress = false;
let syncQueued = false;

// Persist a single document safely to Firestore
async function setFirestoreDoc(collectionName: string, id: string, data: any): Promise<void> {
  try {
    const fsDb = getFirestore();
    const docRef = doc(fsDb, collectionName, id);
    await setDoc(docRef, cleanDoc(data), { merge: true });
  } catch (err: any) {
    console.error(`Failed to persist doc to ${collectionName}/${id}:`, err?.message || err);
  }
}

// Initialize Firestore on server start: migrate if empty, else load collections
export async function initFirestoreDb(): Promise<void> {
  try {
    const fsDb = getFirestore();
    console.log('[Firestore] Checking users collection in Firestore...');
    const usersSnap = await getDocs(collection(fsDb, 'users'));

    if (usersSnap.size === 0) {
      console.log('[Firestore] Users collection is empty. Starting initial migration from data/db.json into Firestore...');
      let sourceDb: DbSchema;
      if (fs.existsSync(DB_FILE)) {
        try {
          sourceDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        } catch (e) {
          sourceDb = createInitialDb();
        }
      } else {
        sourceDb = createInitialDb();
      }

      // Ensure all arrays exist
      if (!sourceDb.customerTabs) sourceDb.customerTabs = [];
      if (!sourceDb.coinAllocations) sourceDb.coinAllocations = [];
      if (!sourceDb.coinCompensations) sourceDb.coinCompensations = [];
      if (!sourceDb.bankAccounts) sourceDb.bankAccounts = [];
      if (!sourceDb.reconciliations) sourceDb.reconciliations = [];
      if (!sourceDb.transactions) sourceDb.transactions = [];
      if (!sourceDb.auditLogs) sourceDb.auditLogs = [];
      if (!sourceDb.meta) {
        sourceDb.meta = { initialized: true, version: 1, lastReceiptSeq: 1000, lastTabSeq: 100 };
      }

      // 1. Migrate users
      for (const u of sourceDb.users) {
        await setDoc(doc(fsDb, 'users', u.id), u);
      }
      // 2. Migrate games
      for (const g of sourceDb.games) {
        await setDoc(doc(fsDb, 'games', g.id), g);
      }
      // 3. Migrate transactions
      for (const t of sourceDb.transactions) {
        await setDoc(doc(fsDb, 'transactions', t.id), t);
      }
      // 4. Migrate customerTabs
      for (const tab of sourceDb.customerTabs) {
        await setDoc(doc(fsDb, 'customerTabs', tab.id), tab);
      }
      // 5. Migrate coinAllocations
      for (const a of sourceDb.coinAllocations) {
        await setDoc(doc(fsDb, 'coinAllocations', a.id), a);
      }
      // 6. Migrate coinCompensations
      for (const c of sourceDb.coinCompensations) {
        await setDoc(doc(fsDb, 'coinCompensations', c.id), c);
      }
      // 7. Migrate bankAccounts
      for (const b of sourceDb.bankAccounts) {
        await setDoc(doc(fsDb, 'bankAccounts', b.id), b);
      }
      // 8. Migrate reconciliations
      for (const r of sourceDb.reconciliations) {
        await setDoc(doc(fsDb, 'reconciliations', r.id), r);
      }
      // 9. Migrate auditLogs
      for (const log of sourceDb.auditLogs) {
        await setDoc(doc(fsDb, 'auditLogs', log.id), log);
      }
      // 10. Migrate meta/system doc
      await setDoc(doc(fsDb, 'meta', 'system'), {
        lastReceiptSeq: sourceDb.meta.lastReceiptSeq || 1000,
        lastTabSeq: sourceDb.meta.lastTabSeq || 100,
        initialized: true,
        version: sourceDb.meta.version || 1,
        updatedAt: new Date().toISOString(),
      });

      dbCache = sourceDb;
      console.log(
        `[Firestore] Initial migration complete: ${sourceDb.users.length} users, ${sourceDb.games.length} games, ${sourceDb.auditLogs.length} audit logs migrated to Cloud Firestore.`
      );
    } else {
      console.log('[Firestore] Loading all collections from Cloud Firestore into memory cache...');
      const [
        usersSnap,
        gamesSnap,
        txnsSnap,
        tabsSnap,
        allocSnap,
        compSnap,
        bankSnap,
        recSnap,
        auditSnap,
        metaDocSnap,
      ] = await Promise.all([
        getDocs(collection(fsDb, 'users')),
        getDocs(collection(fsDb, 'games')),
        getDocs(collection(fsDb, 'transactions')),
        getDocs(collection(fsDb, 'customerTabs')),
        getDocs(collection(fsDb, 'coinAllocations')),
        getDocs(collection(fsDb, 'coinCompensations')),
        getDocs(collection(fsDb, 'bankAccounts')),
        getDocs(collection(fsDb, 'reconciliations')),
        getDocs(collection(fsDb, 'auditLogs')),
        getDoc(doc(fsDb, 'meta', 'system')),
      ]);

      const users: (User & { passwordHash: string })[] = [];
      usersSnap.forEach((d) => users.push(d.data() as any));

      const games: Game[] = [];
      gamesSnap.forEach((d) => games.push(d.data() as any));

      const transactions: Transaction[] = [];
      txnsSnap.forEach((d) => transactions.push(d.data() as any));

      const customerTabs: CustomerTab[] = [];
      tabsSnap.forEach((d) => customerTabs.push(d.data() as any));

      const coinAllocations: CoinAllocation[] = [];
      allocSnap.forEach((d) => coinAllocations.push(d.data() as any));

      const coinCompensations: CoinCompensation[] = [];
      compSnap.forEach((d) => coinCompensations.push(d.data() as any));

      const bankAccounts: BankAccount[] = [];
      bankSnap.forEach((d) => bankAccounts.push(d.data() as any));

      const reconciliations: DailyReconciliation[] = [];
      recSnap.forEach((d) => reconciliations.push(d.data() as any));

      const auditLogs: AuditLog[] = [];
      auditSnap.forEach((d) => auditLogs.push(d.data() as any));
      // Sort newest first by timestamp
      auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      let meta = {
        initialized: true,
        version: 1,
        lastReceiptSeq: 1000,
        lastTabSeq: 100,
      };

      if (metaDocSnap.exists()) {
        const mData = metaDocSnap.data();
        meta = {
          initialized: mData.initialized ?? true,
          version: mData.version ?? 1,
          lastReceiptSeq: mData.lastReceiptSeq ?? 1000,
          lastTabSeq: mData.lastTabSeq ?? 100,
        };
      }

      dbCache = {
        users,
        games,
        transactions,
        customerTabs,
        reconciliations,
        correctionRequests: [],
        coinAllocations,
        coinCompensations,
        bankAccounts,
        auditLogs,
        meta,
      };

      console.log(
        `[Firestore] Loaded: ${users.length} users, ${games.length} games, ${transactions.length} txns, ${coinAllocations.length} allocations, ${bankAccounts.length} bank accounts, ${auditLogs.length} audit logs.`
      );
    }

    isMigratedOrLoaded = true;
    // Write backup copy to data/db.json
    saveBackupJson(dbCache!);
  } catch (err: any) {
    console.error('[Firestore] Error in initFirestoreDb:', err);
    if (!dbCache) {
      dbCache = readBackupJson();
    }
  }
}

function readBackupJson(): DbSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed.customerTabs) parsed.customerTabs = [];
      if (!parsed.coinAllocations) parsed.coinAllocations = [];
      if (!parsed.coinCompensations) parsed.coinCompensations = [];
      if (!parsed.bankAccounts) parsed.bankAccounts = [];
      if (!parsed.reconciliations) parsed.reconciliations = [];
      if (!parsed.transactions) parsed.transactions = [];
      if (!parsed.auditLogs) parsed.auditLogs = [];
      if (!parsed.meta) parsed.meta = { initialized: true, version: 1, lastReceiptSeq: 1000, lastTabSeq: 100 };
      return parsed;
    }
  } catch (e) {
    console.error('Failed to read db.json backup:', e);
  }
  return createInitialDb();
}

function saveBackupJson(db: DbSchema): void {
  // Requirement 4: data/db.json must remain untouched as a backup
  return;
}

export function readDb(): DbSchema {
  if (dbCache) {
    if (!dbCache.customerTabs) dbCache.customerTabs = [];
    if (!dbCache.coinAllocations) dbCache.coinAllocations = [];
    if (!dbCache.coinCompensations) dbCache.coinCompensations = [];
    if (!dbCache.bankAccounts) dbCache.bankAccounts = [];
    if (!dbCache.reconciliations) dbCache.reconciliations = [];
    if (!dbCache.transactions) dbCache.transactions = [];
    if (!dbCache.auditLogs) dbCache.auditLogs = [];
    return dbCache;
  }
  dbCache = readBackupJson();
  return dbCache;
}

// Track known doc IDs to avoid unnecessary duplicate writes
const knownUserIds = new Set<string>();
const knownGameIds = new Set<string>();
const knownTxnIds = new Set<string>();
const knownTabIds = new Set<string>();
const knownAllocIds = new Set<string>();
const knownCompIds = new Set<string>();
const knownBankIds = new Set<string>();
const knownReconIds = new Set<string>();
const knownAuditIds = new Set<string>();

export function saveDb(db: DbSchema): void {
  dbCache = db;
  // Always update local db.json backup
  saveBackupJson(db);

  // Synchronize changes to Cloud Firestore
  scheduleFirestoreSync();
}

function scheduleFirestoreSync(): void {
  if (syncInProgress) {
    syncQueued = true;
    return;
  }
  syncInProgress = true;
  syncQueued = false;

  persistToFirestoreAsync(dbCache || readBackupJson())
    .catch((err) => {
      console.error('Error during Firestore sync:', err?.message || err);
    })
    .finally(() => {
      syncInProgress = false;
      if (syncQueued) {
        scheduleFirestoreSync();
      }
    });
}

// Force wait for all pending writes to finish
export async function flushDbToFirestore(): Promise<void> {
  const currentDb = dbCache || readBackupJson();
  await persistToFirestoreAsync(currentDb);
}

async function persistToFirestoreAsync(db: DbSchema): Promise<void> {
  try {
    const fsDb = getFirestore();

    // 1. Users
    for (const u of db.users) {
      await setDoc(doc(fsDb, 'users', u.id), cleanDoc(u), { merge: true });
    }

    // 2. Games
    for (const g of db.games) {
      await setDoc(doc(fsDb, 'games', g.id), cleanDoc(g), { merge: true });
    }

    // 3. Transactions (undeletable)
    for (const t of db.transactions) {
      if (!knownTxnIds.has(t.id) || t.status === 'VOIDED' || t.status === 'CORRECTED') {
        await setDoc(doc(fsDb, 'transactions', t.id), cleanDoc(t), { merge: true });
        knownTxnIds.add(t.id);
      }
    }

    // 4. Customer Tabs
    const currentTabIds = new Set(db.customerTabs.map((tb) => tb.id));
    for (const tab of db.customerTabs) {
      await setDoc(doc(fsDb, 'customerTabs', tab.id), cleanDoc(tab), { merge: true });
      knownTabIds.add(tab.id);
    }
    // Delete any tabs removed from active collection (draft tabs cancelled)
    for (const existingId of Array.from(knownTabIds)) {
      if (!currentTabIds.has(existingId)) {
        try {
          await deleteDoc(doc(fsDb, 'customerTabs', existingId));
          knownTabIds.delete(existingId);
        } catch (e) {
          // ignore
        }
      }
    }

    // 5. Coin Allocations
    for (const a of db.coinAllocations) {
      await setDoc(doc(fsDb, 'coinAllocations', a.id), cleanDoc(a), { merge: true });
      knownAllocIds.add(a.id);
    }

    // 6. Coin Compensations
    for (const c of db.coinCompensations) {
      if (!knownCompIds.has(c.id)) {
        await setDoc(doc(fsDb, 'coinCompensations', c.id), cleanDoc(c), { merge: true });
        knownCompIds.add(c.id);
      }
    }

    // 7. Bank Accounts
    for (const b of db.bankAccounts) {
      await setDoc(doc(fsDb, 'bankAccounts', b.id), cleanDoc(b), { merge: true });
      knownBankIds.add(b.id);
    }

    // 8. Reconciliations
    for (const r of db.reconciliations) {
      await setDoc(doc(fsDb, 'reconciliations', r.id), cleanDoc(r), { merge: true });
      knownReconIds.add(r.id);
    }

    // 9. Audit Logs (append-only, immutable)
    for (const l of db.auditLogs) {
      if (!knownAuditIds.has(l.id)) {
        await setDoc(doc(fsDb, 'auditLogs', l.id), cleanDoc(l));
        knownAuditIds.add(l.id);
      }
    }

    // 10. Meta / system document: run Firestore transaction to ensure atomic sequence numbers
    try {
      const metaRef = doc(fsDb, 'meta', 'system');
      await runTransaction(fsDb, async (t) => {
        const snap = await t.get(metaRef);
        let curReceipt = 1000;
        let curTab = 100;
        if (snap.exists()) {
          const d = snap.data();
          curReceipt = d.lastReceiptSeq || 1000;
          curTab = d.lastTabSeq || 100;
        }
        const nextReceipt = Math.max(curReceipt, db.meta?.lastReceiptSeq || 1000);
        const nextTab = Math.max(curTab, db.meta?.lastTabSeq || 100);
        t.set(
          metaRef,
          cleanDoc({
            lastReceiptSeq: nextReceipt,
            lastTabSeq: nextTab,
            initialized: true,
            version: db.meta?.version || 1,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      });
    } catch (metaErr: any) {
      console.error('Failed to update meta/system transaction:', metaErr?.message || metaErr);
    }
  } catch (err: any) {
    console.error('Error persisting to Firestore:', err?.message || err);
  }
}

// Log audit helper (append-only)
export function addAuditLog(
  actor: { id: string; name: string; role: 'ADMIN' | 'CASHIER' | 'SYSTEM' },
  action: string,
  entityType:
    | 'TRANSACTION'
    | 'GAME'
    | 'USER'
    | 'RECONCILIATION'
    | 'CORRECTION_REQUEST'
    | 'COIN_ALLOCATION'
    | 'COIN_COMPENSATION'
    | 'BANK_ACCOUNT'
    | 'SYSTEM',
  entityId: string,
  details: {
    previousValues?: Record<string, any>;
    newValues?: Record<string, any>;
    reason?: string;
  } = {}
): AuditLog {
  const db = readDb();
  const now = new Date();
  const log: AuditLog = {
    id: `audit_${crypto.randomUUID()}`,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    previousValues: details.previousValues,
    newValues: details.newValues,
    reason: details.reason,
    timestamp: now.toISOString(),
    businessDate: getLagosDateString(now),
  };
  db.auditLogs.unshift(log); // newest first
  saveDb(db);

  // Directly create the immutable document in Cloud Firestore
  setFirestoreDoc('auditLogs', log.id, log);

  return log;
}

// Helper to allocate receipt sequence atomically in Firestore
export async function allocateReceiptSeqTransaction(): Promise<number> {
  const fsDb = getFirestore();
  const metaRef = doc(fsDb, 'meta', 'system');
  return await runTransaction(fsDb, async (t) => {
    const snap = await t.get(metaRef);
    let lastReceiptSeq = 1000;
    let lastTabSeq = 100;
    if (snap.exists()) {
      const d = snap.data();
      lastReceiptSeq = d.lastReceiptSeq || 1000;
      lastTabSeq = d.lastTabSeq || 100;
    }
    const nextSeq = lastReceiptSeq + 1;
    t.set(
      metaRef,
      {
        lastReceiptSeq: nextSeq,
        lastTabSeq,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    if (dbCache && dbCache.meta) {
      dbCache.meta.lastReceiptSeq = nextSeq;
    }
    return nextSeq;
  });
}

function createInitialDb(): DbSchema {
  const adminId = 'usr_admin_master';
  const now = new Date();
  const lagosToday = getLagosDateString(now);

  const salt = bcrypt.genSaltSync(10);
  const adminHash = bcrypt.hashSync('AdminPass123!', salt);

  const users: (User & { passwordHash: string })[] = [
    {
      id: adminId,
      username: 'admin',
      name: 'Super Admin (Manager)',
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: false,
      createdBy: null,
      createdAt: now.toISOString(),
      lastLoginAt: now.toISOString(),
      passwordHash: adminHash,
    },
  ];

  const games: Game[] = [
    {
      id: 'game_ps_fifa24',
      name: 'FIFA 24',
      category: 'PS_GAME',
      description: 'PlayStation 5 tournament edition, 1v1 match play',
      isActive: true,
      standardPriceKobo: 150000,
      coinsRequired: 0,
      pricePerCoinKobo: 0,
      calculatedPriceKobo: 150000,
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'game_ps_mk1',
      name: 'Mortal Kombat 1',
      category: 'PS_GAME',
      description: 'PlayStation 5 versus battle edition',
      isActive: true,
      standardPriceKobo: 150000,
      coinsRequired: 0,
      pricePerCoinKobo: 0,
      calculatedPriceKobo: 150000,
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'game_ps_tekken8',
      name: 'Tekken 8',
      category: 'PS_GAME',
      description: 'PlayStation 5 arcade mode',
      isActive: true,
      standardPriceKobo: 150000,
      coinsRequired: 0,
      pricePerCoinKobo: 0,
      calculatedPriceKobo: 150000,
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'game_snooker_standard',
      name: 'Snooker (1 Frame)',
      category: 'SNOOKER',
      description: 'Standard 12ft full table frame session',
      isActive: true,
      standardPriceKobo: 100000,
      coinsRequired: 0,
      pricePerCoinKobo: 0,
      calculatedPriceKobo: 100000,
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'game_coin_carracing',
      name: 'Car Racing (Arcade)',
      category: 'COIN_GAME',
      description: 'Motion simulator cockpit arcade machine',
      isActive: true,
      standardPriceKobo: 0,
      coinsRequired: 4,
      pricePerCoinKobo: 50000,
      calculatedPriceKobo: 200000,
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'game_coin_bikeracing',
      name: 'Bike Racing (MotoGP)',
      category: 'COIN_GAME',
      description: 'Superbike simulation arcade cabinet',
      isActive: true,
      standardPriceKobo: 0,
      coinsRequired: 2,
      pricePerCoinKobo: 50000,
      calculatedPriceKobo: 100000,
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'game_coin_basketball',
      name: 'Hoop Mania Basketball',
      category: 'COIN_GAME',
      description: 'Coin-operated electronic basketball shootout',
      isActive: true,
      standardPriceKobo: 0,
      coinsRequired: 3,
      pricePerCoinKobo: 50000,
      calculatedPriceKobo: 150000,
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: `audit_sys_init`,
      actorId: adminId,
      actorName: 'System Bootstrap',
      actorRole: 'SYSTEM',
      action: 'SYSTEM_INITIALIZED',
      entityType: 'SYSTEM',
      entityId: 'system_root',
      newValues: { message: 'Initialized Game Lounge Database with standard catalog and staff credentials.' },
      timestamp: now.toISOString(),
      businessDate: lagosToday,
    },
  ];

  return {
    users,
    games,
    transactions: [],
    customerTabs: [],
    reconciliations: [],
    correctionRequests: [],
    coinAllocations: [],
    coinCompensations: [],
    bankAccounts: [],
    auditLogs,
    meta: {
      initialized: true,
      version: 1,
      lastReceiptSeq: 1000,
      lastTabSeq: 100,
    },
  };
}
