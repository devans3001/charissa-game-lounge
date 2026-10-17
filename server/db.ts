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
  setLogLevel,
} from 'firebase/firestore';
import {
  User,
  UserRole,
  Game,
  Transaction,
  CustomerTab,
  DailyReconciliation,
  CorrectionRequest,
  AuditLog,
  CoinAllocation,
  CoinCompensation,
  BankAccount,
  AppSettings,
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
  appSettings: AppSettings | null;
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

// Collections that MUST be readable/writable for the app to work correctly.
// A blocked read here used to fail silently (the UI showed an empty list and
// the user thought nothing had been saved), so it is probed at boot and any
// problem is printed with the exact fix.
const RULES_PROBE = [
  { name: 'correctionRequests', hint: 'cashier Flag Fix requests (Fix Requests screen)' },
  { name: 'appSettings', hint: 'global coin price', isDoc: true },
  { name: 'transactions', hint: 'sales ledger', isDoc: false },
  { name: 'coinAllocations', hint: 'coin vault float allocations' },
  { name: 'coinCompensations', hint: 'lost-coin records' },
] as const;

export async function probeFirestoreRules(): Promise<void> {
  const fsDb = getFirestore();
  const problems: string[] = [];

  for (const probe of RULES_PROBE) {
    try {
      if ((probe as any).isDoc) {
        await getDoc(doc(fsDb, probe.name, 'general'));
      } else {
        await getDocs(collection(fsDb, probe.name));
      }
    } catch (err: any) {
      problems.push(`  ✗ ${probe.name} — ${probe.hint}: ${err?.message || err}`);
    }
  }

  if (problems.length === 0) {
    console.log('[Firestore] Rules probe OK — all critical collections are reachable.');
    return;
  }

  console.error('');
  console.error('[Firestore] ⚠️  RULES NOT DEPLOYED — these features will silently fail:');
  for (const p of problems) console.error(p);
  console.error('[Firestore] Fix: deploy the rules in firestore.rules, then restart:');
  console.error('[Firestore]   firebase deploy --only firestore:rules');
  console.error('');
}

export function getFirestore(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const app = getApps().length === 0 ? initializeApp(cfg) : getApp();
    try {
      setLogLevel('error');
    } catch {
      // ignore
    }
    // Filter benign gRPC idle stream disconnection messages from console.warn/error
    const isIdleStreamMsg = (args: any[]) => {
      const text = args.map(a => (typeof a === 'string' ? a : a?.message || '')).join(' ');
      return text.includes('Disconnecting idle stream') || text.includes('Timed out waiting for new targets');
    };
    const origWarn = console.warn;
    console.warn = (...args: any[]) => {
      if (isIdleStreamMsg(args)) return;
      origWarn.apply(console, args);
    };
    const origError = console.error;
    console.error = (...args: any[]) => {
      if (isIdleStreamMsg(args)) return;
      origError.apply(console, args);
    };

    firestoreInstance = initializeFirestore(app, { ignoreUndefinedProperties: true }, cfg.firestoreDatabaseId);
    return firestoreInstance;
  }
  throw new Error('firebase-applet-config.json not found for Firestore initialization');
}

export function cleanDoc<T>(obj: T): any {
  return JSON.parse(JSON.stringify(obj));
}

// ============================================================================
// DIRECT FIRESTORE DATA LAYER
// Every request reads straight from Cloud Firestore and every write is
// awaited directly to Firestore BEFORE the HTTP response returns.
// There is NO in-memory cache and NO background sync — Firestore is the
// single source of truth. Any server instance serves any request identically.
// ============================================================================

const COLLECTIONS = [
  'users',
  'games',
  'transactions',
  'customerTabs',
  'reconciliations',
  'correctionRequests',
  'coinAllocations',
  'coinCompensations',
  'bankAccounts',
  'auditLogs',
] as const;

type CollectionName = (typeof COLLECTIONS)[number];

type DbSnapshot = Record<CollectionName, Map<string, string>> & { meta: string };

// Per-document JSON snapshot of the state loaded from Firestore, keyed by the
// db object returned from readDb(). saveDb() diffs against it so only changed
// documents are written (a sale writes ~4 docs, not the whole database).
const loadSnapshots = new WeakMap<DbSchema, DbSnapshot>();

function snapshotOf(db: DbSchema): DbSnapshot {
  const snap = {} as any;
  for (const coll of COLLECTIONS) {
    snap[coll] = new Map<string, string>(
      ((db as any)[coll] || []).map((d: any) => [d.id as string, JSON.stringify(cleanDoc(d))])
    );
  }
  snap.meta = JSON.stringify(cleanDoc(db.meta));
  return snap as DbSnapshot;
}

// Defensive normalization: guarantee every collection exists on the object
function normalizeDb<T extends Partial<DbSchema>>(db: T): DbSchema {
  db.users = db.users || [];
  db.games = db.games || [];
  db.transactions = db.transactions || [];
  db.customerTabs = db.customerTabs || [];
  db.reconciliations = db.reconciliations || [];
  db.correctionRequests = db.correctionRequests || [];
  db.coinAllocations = db.coinAllocations || [];
  db.coinCompensations = db.coinCompensations || [];
  db.bankAccounts = db.bankAccounts || [];
  db.auditLogs = db.auditLogs || [];
  if (!db.appSettings) {
    db.appSettings = {
      coinPriceKobo: 50000,
      updatedBy: 'system',
      updatedByName: 'System',
      updatedAt: new Date().toISOString(),
    };
  }
  db.meta = db.meta || { initialized: true, version: 1, lastReceiptSeq: 1000, lastTabSeq: 100 };
  return db as DbSchema;
}

// Read the ENTIRE database directly from Firestore (all collections in
// parallel). Data volume for a game lounge is tiny, so a full read per
// request is cheap and keeps every endpoint's business logic unchanged.
//
// Reads are ISOLATED per collection: if one collection is blocked (e.g. a
// missing security rule — see firestore.rules), the rest still load and the
// request proceeds with that collection empty. The failure is logged loudly
// with the collection name so it can never fail silently.
export async function readDb(): Promise<DbSchema> {
  const fsDb = getFirestore();

  const collResults = await Promise.all(
    COLLECTIONS.map(async (c) => {
      try {
        const snap = await getDocs(collection(fsDb, c));
        const arr: any[] = [];
        snap.forEach((d) => arr.push(d.data()));
        return { coll: c, docs: arr };
      } catch (err: any) {
        console.error(
          `[Firestore] BLOCKED read on collection '${c}' — check firestore.rules is deployed for it:`,
          err?.message || err
        );
        return { coll: c, docs: [] as any[] };
      }
    })
  );

  let metaDocData: any = null;
  let settingsDocData: any = null;
  try {
    const metaDocSnap = await getDoc(doc(fsDb, 'meta', 'system'));
    if (metaDocSnap.exists()) metaDocData = metaDocSnap.data();
  } catch (err: any) {
    console.error('[Firestore] BLOCKED read on meta/system:', err?.message || err);
  }
  try {
    const settingsSnap = await getDoc(doc(fsDb, 'appSettings', 'general'));
    if (settingsSnap.exists()) settingsDocData = settingsSnap.data();
  } catch (err: any) {
    console.error('[Firestore] BLOCKED read on appSettings/general:', err?.message || err);
  }

  const db = {} as DbSchema;
  for (const { coll, docs } of collResults) {
    (db as any)[coll] = docs;
  }

  // Audit logs: newest first (matches historical in-memory behavior)
  db.auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  let meta = { initialized: true, version: 1, lastReceiptSeq: 1000, lastTabSeq: 100 };
  if (metaDocData) {
    meta = {
      initialized: metaDocData.initialized ?? true,
      version: metaDocData.version ?? 1,
      lastReceiptSeq: metaDocData.lastReceiptSeq ?? 1000,
      lastTabSeq: metaDocData.lastTabSeq ?? 100,
    };
  }
  db.meta = meta;
  db.appSettings = settingsDocData && typeof settingsDocData.coinPriceKobo === 'number'
    ? {
        coinPriceKobo: settingsDocData.coinPriceKobo,
        updatedBy: settingsDocData.updatedBy || 'system',
        updatedByName: settingsDocData.updatedByName || 'System',
        updatedAt: settingsDocData.updatedAt || new Date().toISOString(),
      }
    : null;

  normalizeDb(db);
  loadSnapshots.set(db, snapshotOf(db));
  return db;
}


// Write the database state directly to Firestore. Uses the load-time
// snapshot to compute a per-document diff: only changed/new documents are
// written, removed documents are deleted — every write is awaited here
// before the request completes, so nothing can ever be lost to a restart
// or redeploy. Errors on individual documents are isolated (logged, not
// fatal) so one failed write never blocks the others.
export async function saveDb(db: DbSchema): Promise<void> {
  const fsDb = getFirestore();
  const prev = loadSnapshots.get(db);
  const writes: Promise<void>[] = [];
  // Writes that MUST succeed. A failure here means the caller's change was
  // silently dropped — historically this looked like a "success" response with
  // nothing persisted (e.g. a cashier's Flag Fix request vanishing), so it is
  // surfaced loudly as an error instead of being swallowed.
  const writeFailures: string[] = [];

  for (const coll of COLLECTIONS) {
    const prevMap: Map<string, string> = prev?.[coll] ?? new Map();
    const current = ((db as any)[coll] || []) as any[];
    const currentIds = new Set<string>();

    for (const docData of current) {
      currentIds.add(docData.id);
      const json = JSON.stringify(cleanDoc(docData));
      if (prevMap.get(docData.id) !== json) {
        writes.push(
          setDoc(doc(fsDb, coll, docData.id), cleanDoc(docData), { merge: true }).catch((err: any) => {
            writeFailures.push(`${coll}/${docData.id}: ${err?.message || err}`);
            console.error(`[Firestore] Failed writing ${coll}/${docData.id}:`, err?.message || err);
          })
        );
      }
    }

    for (const [existingId] of prevMap) {
      if (!currentIds.has(existingId)) {
        writes.push(
          deleteDoc(doc(fsDb, coll, existingId)).catch((err: any) => {
            // Immutable collections (transactions, auditLogs, coinCompensations)
            // are protected by firestore.rules from deletion — logged, not fatal.
            console.error(`[Firestore] Failed deleting ${coll}/${existingId}:`, err?.message || err);
          })
        );
      }
    }
  }

  await Promise.all(writes);

  if (writeFailures.length > 0) {
    throw new Error(
      `Save failed — Firestore rejected ${writeFailures.length} write(s). Deploy the latest firestore.rules ` +
        `(firebase deploy --only firestore:rules), then retry. First failure: ${writeFailures[0]}`
    );
  }

  // meta/system counters: monotonic — never allowed to move backwards
  await persistMeta(db.meta);
  if (db.appSettings) {
    try {
      await persistSettings(db.appSettings);
    } catch (err: any) {
      console.error('[Firestore] saveDb: settings write failed:', err?.message || err);
    }
  }

  loadSnapshots.set(db, snapshotOf(db));
}

export async function persistSettings(settings: AppSettings): Promise<void> {
  const fsDb = getFirestore();
  const clean: any = cleanDoc(settings);
  await setDoc(doc(fsDb, 'appSettings', 'general'), clean, { merge: true });
}

async function persistMeta(meta: DbSchema['meta']): Promise<void> {
  try {
    const fsDb = getFirestore();
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
      t.set(
        metaRef,
        cleanDoc({
          lastReceiptSeq: Math.max(curReceipt, meta?.lastReceiptSeq || 1000),
          lastTabSeq: Math.max(curTab, meta?.lastTabSeq || 100),
          initialized: true,
          version: meta?.version || 1,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );
    });
  } catch (err: any) {
    console.error('[Firestore] Failed updating meta/system:', err?.message || err);
  }
}


// Atomic counter allocation — safe even when multiple cashiers create sales
// at the exact same moment (Firestore transaction guarantees no duplicates).
export async function allocateReceiptSeq(): Promise<number> {
  const fsDb = getFirestore();
  const metaRef = doc(fsDb, 'meta', 'system');
  return await runTransaction(fsDb, async (t) => {
    const snap = await t.get(metaRef);
    const cur = snap.exists() ? snap.data().lastReceiptSeq || 1000 : 1000;
    const next = cur + 1;
    t.set(metaRef, cleanDoc({ lastReceiptSeq: next, updatedAt: new Date().toISOString() }), { merge: true });
    return next;
  });
}

export async function allocateTabSeq(): Promise<number> {
  const fsDb = getFirestore();
  const metaRef = doc(fsDb, 'meta', 'system');
  return await runTransaction(fsDb, async (t) => {
    const snap = await t.get(metaRef);
    const cur = snap.exists() ? snap.data().lastTabSeq || 100 : 100;
    const next = cur + 1;
    t.set(metaRef, cleanDoc({ lastTabSeq: next, updatedAt: new Date().toISOString() }), { merge: true });
    return next;
  });
}

// Boot: verify connectivity, and seed the initial catalog + admin account
// ONLY when the users collection is completely empty (first-ever boot).
export async function initFirestoreDb(): Promise<void> {
  try {
    const fsDb = getFirestore();
    console.log('[Firestore] Checking users collection...');
    const usersSnap = await getDocs(collection(fsDb, 'users'));

    if (usersSnap.size === 0) {
      console.log('[Firestore] Empty database — seeding initial catalog and admin account...');
      const seed = normalizeDb(readBackupJson());
      let count = 0;
      for (const coll of COLLECTIONS) {
        for (const d of ((seed as any)[coll] as any[]) || []) {
          await setDoc(doc(fsDb, coll, d.id), cleanDoc(d));
          count++;
        }
      }
      await persistMeta(seed.meta);
      console.log(`[Firestore] Seeded ${count} documents. Login: admin / AdminPass123!`);
    } else {
      console.log('[Firestore] Live data present — direct mode ready.');
    }
  } catch (err: any) {
    // Server still starts; requests will fail loudly with the Firestore error
    console.error('[Firestore] Init failed (server will still start, requests may fail):', err?.message || err);
  }
}

// Optional first-boot seed source: the legacy data/db.json file
function readBackupJson(): DbSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return normalizeDb(parsed);
    }
  } catch (e) {
    console.error('Failed to read db.json seed file:', e);
  }
  return createInitialDb();
}

// Global coin price (kobo). Falls back to 50000 when settings are missing
// (e.g. blocked read) so sales can never crash on price lookup.
export function getCoinPriceKobo(db: DbSchema): number {
  const p = db.appSettings?.coinPriceKobo;
  return typeof p === 'number' && p > 0 ? p : 50000;
}

// Ensure a settings object exists (lazy seed at 50000 on first use)
export function ensureSettings(db: DbSchema): void {
  if (!db.appSettings) {
    const now = new Date().toISOString();
    db.appSettings = {
      coinPriceKobo: 50000,
      updatedBy: 'system',
      updatedByName: 'System',
      updatedAt: now,
    };
  }
}

// Log audit helper (append-only — audit logs are NEVER updated or deleted)
export async function addAuditLog(
  actor: { id: string; name: string; role: UserRole | 'SYSTEM' },
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
): Promise<AuditLog> {
  const db = await readDb();
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
  await saveDb(db); // writes the new log document directly to Firestore
  return log;
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

  const settingsNow = new Date().toISOString();
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
    appSettings: {
      coinPriceKobo: 50000,
      updatedBy: adminId,
      updatedByName: 'System Bootstrap',
      updatedAt: settingsNow,
    },
    meta: {
      initialized: true,
      version: 1,
      lastReceiptSeq: 1000,
      lastTabSeq: 100,
    },
  };
}
