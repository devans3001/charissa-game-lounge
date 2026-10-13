export type UserRole = 'ADMIN' | 'CASHIER';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  phoneNumber?: string;
  mustChangePassword?: boolean;
  createdBy: string | null;
  createdAt: string;
  lastLoginAt?: string;
}

export type GameCategory = 'PS_GAME' | 'SNOOKER' | 'COIN_GAME';

export interface Game {
  id: string;
  name: string;
  category: GameCategory;
  description?: string;
  isActive: boolean;
  standardPriceKobo: number; // For PS_GAME and SNOOKER (e.g. 150000 = ₦1,500.00)
  coinsRequired: number;     // For COIN_GAME (e.g. 4)
  pricePerCoinKobo: number;  // For COIN_GAME (e.g. 50000 = ₦500.00)
  calculatedPriceKobo: number; // Effective price per play
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'CASH' | 'POS' | 'BANK_TRANSFER';

export type TransactionStatus = 'COMPLETED' | 'VOIDED' | 'CORRECTED';

export interface TransactionItem {
  id: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  quantity: number;
  unitPriceKobo: number;
  totalAmountKobo: number;
  coinsRequiredSnapshot?: number;
  pricePerCoinKoboSnapshot?: number;
}

export interface Transaction {
  id: string;
  receiptNumber: string;
  customerName?: string;
  tabId?: string;
  tabNumber?: string;
  items?: TransactionItem[];
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  quantity: number;
  coinsRequiredSnapshot?: number;
  pricePerCoinKoboSnapshot?: number;
  unitPriceKobo: number;
  totalAmountKobo: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  senderName?: string;
  cashierId: string;
  cashierName: string;
  status: TransactionStatus;
  timestamp: string;      // ISO
  businessDate: string;   // YYYY-MM-DD (Africa/Lagos)
  createdAt: string;
  voidReason?: string;
  voidedBy?: string;
  voidedByName?: string;
  voidedAt?: string;
  correctionNote?: string;
  correctedBy?: string;
  correctedByName?: string;
  correctedAt?: string;
}

export type TabStatus = 'OPEN' | 'PAID' | 'CANCELLED';

export interface CustomerTabItem {
  id: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  quantity: number;
  unitPriceKobo: number;
  totalAmountKobo: number;
  coinsRequiredSnapshot?: number;
  pricePerCoinKoboSnapshot?: number;
  addedAt: string;
}

export interface CustomerTab {
  id: string;
  tabNumber: string; // e.g. "TAB-101"
  customerName: string;
  phoneNumber?: string;
  stationOrNote?: string; // e.g. "Station 3", "VIP Table"
  items: CustomerTabItem[];
  totalAmountKobo: number;
  status: TabStatus;
  cashierId: string;
  cashierName: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  senderName?: string;
  receiptNumber?: string;
  transactionId?: string;
}

export interface CorrectionRequest {
  id: string;
  transactionId: string;
  receiptNumber: string;
  gameName: string;
  amountKobo: number;
  paymentMethod: PaymentMethod;
  cashierId: string;
  cashierName: string;
  reason: string;
  requestedAction: 'VOID' | 'CHANGE_PAYMENT_METHOD';
  proposedPaymentMethod?: PaymentMethod;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
}

export type ReconciliationStatus = 'DRAFT' | 'BALANCED' | 'DISCREPANCY_FOUND' | 'REOPENED';

export interface DailyReconciliation {
  id: string;
  businessDate: string;
  recordedCashKobo: number;
  recordedPosKobo: number;
  recordedTransferKobo: number;
  recordedTotalKobo: number;
  transactionCount: number;
  
  actualCashKobo: number;
  actualPosKobo: number;
  actualTransferKobo: number;
  actualTotalKobo: number;
  
  diffCashKobo: number;
  diffPosKobo: number;
  diffTransferKobo: number;
  diffTotalKobo: number;
  
  posTerminalReference?: string;
  bankSettlementTotalKobo?: number;
  notes?: string;
  status: ReconciliationStatus;
  
  createdBy: string;
  createdByName: string;
  approvedBy?: string;
  approvedByName?: string;
  reopenedBy?: string;
  reopenedByName?: string;
  reopenReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole | 'SYSTEM';
  action: string;
  entityType: 'TRANSACTION' | 'GAME' | 'USER' | 'RECONCILIATION' | 'CORRECTION_REQUEST' | 'COIN_ALLOCATION' | 'COIN_COMPENSATION' | 'BANK_ACCOUNT' | 'SYSTEM';
  entityId: string;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  reason?: string;
  timestamp: string;
  businessDate: string;
}

export interface CoinAllocation {
  id: string;
  cashierId: string;
  cashierName: string;
  allocatedBy: string;
  allocatedByName: string;
  initialCoins: number;
  notes?: string;
  businessDate: string;
  timestamp: string;
  status: 'ACTIVE' | 'CLOSED';
  // Populated when admin performs the end-of-shift physical coin count
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  actualRemainingCoins?: number;
  discrepancyCoins?: number; // actual - expected (negative = shortage/theft/loss)
  closeNotes?: string;
}

export interface CoinCompensation {
  id: string;
  cashierId: string;
  cashierName: string;
  customerName: string;
  gameId?: string;
  gameName: string;
  coinsIssued: number;
  reason: string;
  notes?: string;
  businessDate: string;
  timestamp: string;
}

export interface CashierCoinBalance {
  cashierId: string;
  cashierName: string;
  businessDate: string;
  allocatedCoins: number;
  soldCoins: number;           // coins consumed by non-voided COIN_GAME sales
  voidedCoins: number;         // coins consumed by VOIDED sales (e.g. coin stuck in machine) — still deducted from float
  compensatedCoins: number;    // replacement coins issued free (power outage etc.)
  expectedRemainingCoins: number; // allocated - sold - voided - compensated
  actualRemainingCoins?: number;
  discrepancyCoins?: number;
  notes?: string;
}

export interface BankAccount {
  id: string;
  slotNumber: 1 | 2 | 3;
  bankName: string;
  accountNumber: string;
  accountName: string;
  label?: string;
  isActive: boolean;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
}

export interface DashboardStats {
  period: string;
  startDate: string;
  endDate: string;
  totalRevenueKobo: number;
  totalTransactions: number;
  cashSalesKobo: number;
  posSalesKobo: number;
  transferSalesKobo: number;
  categoryBreakdown: {
    category: GameCategory;
    revenueKobo: number;
    count: number;
  }[];
  gameBreakdown: {
    gameId: string;
    gameName: string;
    category: GameCategory;
    revenueKobo: number;
    count: number;
  }[];
  cashierBreakdown: {
    cashierId: string;
    cashierName: string;
    revenueKobo: number;
    count: number;
  }[];
  recentTransactions: Transaction[];
  coinStats?: {
    totalAllocated: number;
    totalSold: number;
    totalVoided: number;
    totalCompensated: number;
    totalRemaining: number;
  };
  reconciliationStatus?: {
    date: string;
    status: ReconciliationStatus;
    diffTotalKobo: number;
  };
}

