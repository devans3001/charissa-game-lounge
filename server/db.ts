import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  User,
  Game,
  Transaction,
  CustomerTab,
  DailyReconciliation,
  CorrectionRequest,
  AuditLog,
  GameCategory,
  PaymentMethod,
} from '../src/types/index.ts';

interface DbSchema {
  users: (User & { passwordHash: string })[];
  games: Game[];
  transactions: Transaction[];
  customerTabs: CustomerTab[];
  reconciliations: DailyReconciliation[];
  correctionRequests: CorrectionRequest[];
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

// Ensure directory exists
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

let dbCache: DbSchema | null = null;

export function readDb(): DbSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = createInitialDb();
      saveDb(initial);
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    dbCache = JSON.parse(raw);
    if (!dbCache!.customerTabs) {
      dbCache!.customerTabs = [];
    }
    return dbCache!;
  } catch (err) {
    if (dbCache) {
      if (!dbCache.customerTabs) dbCache.customerTabs = [];
      return dbCache;
    }
    console.error('Error reading DB, re-initializing backup:', err);
    const initial = createInitialDb();
    saveDb(initial);
    return initial;
  }
}

export function saveDb(db: DbSchema): void {
  dbCache = db;
  const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

function createInitialDb(): DbSchema {
  const adminId = 'usr_admin_master';
  const now = new Date();
  const lagosToday = getLagosDateString(now);

  // Password for admin: AdminPass123!
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

  // Games initial catalog
  const games: Game[] = [
    {
      id: 'game_ps_fifa24',
      name: 'FIFA 24',
      category: 'PS_GAME',
      description: 'PlayStation 5 tournament edition, 1v1 match play',
      isActive: true,
      standardPriceKobo: 150000, // ₦1,500.00
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
      standardPriceKobo: 150000, // ₦1,500.00
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
      standardPriceKobo: 150000, // ₦1,500.00
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
      standardPriceKobo: 100000, // ₦1,000.00
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
      pricePerCoinKobo: 50000, // ₦500.00 per coin
      calculatedPriceKobo: 200000, // 4 * ₦500 = ₦2,000.00
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
      pricePerCoinKobo: 50000, // ₦500.00 per coin
      calculatedPriceKobo: 100000, // 2 * ₦500 = ₦1,000.00
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
      pricePerCoinKobo: 50000, // ₦500.00 per coin
      calculatedPriceKobo: 150000, // 3 * ₦500 = ₦1,500.00
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  // Clean production ledger - 0 mock transactions, 0 mock reconciliations
  const transactions: Transaction[] = [];
  const reconciliations: DailyReconciliation[] = [];

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
    transactions,
    customerTabs: [],
    reconciliations,
    correctionRequests: [],
    auditLogs,
    meta: {
      initialized: true,
      version: 1,
      lastReceiptSeq: 1000,
      lastTabSeq: 100,
    },
  };
}

// Log audit helper
export function addAuditLog(
  actor: { id: string; name: string; role: 'ADMIN' | 'CASHIER' | 'SYSTEM' },
  action: string,
  entityType: 'TRANSACTION' | 'GAME' | 'USER' | 'RECONCILIATION' | 'CORRECTION_REQUEST' | 'SYSTEM',
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
  return log;
}
