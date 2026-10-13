import {
  User,
  Game,
  Transaction,
  CustomerTab,
  CustomerTabItem,
  DailyReconciliation,
  CorrectionRequest,
  AuditLog,
  CoinAllocation,
  CoinCompensation,
  CashierCoinBalance,
  BankAccount,
  AppSettings,
  DashboardStats,
  PaymentMethod,
  GameCategory,
} from '../types/index.ts';

const TOKEN_KEY = 'gamelounge_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) errMsg = data.error;
    } catch {
      // ignore JSON parse error
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    me: () => request<{ user: User }>('/api/auth/me'),
    changePassword: (data: { currentPassword?: string; newPassword: string }) =>
      request<{ success: boolean; message: string; user: User }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    setupAdmin: (username: string, name: string, password: string) =>
      request<{ token: string; user: User }>('/api/auth/setup-admin', {
        method: 'POST',
        body: JSON.stringify({ username, name, password }),
      }),
  },

  settings: {
    get: () => request<{ settings: AppSettings }>('/api/settings'),
    updateCoinPrice: (coinPriceKobo: number) =>
      request<{ settings: AppSettings }>('/api/settings/coin-price', {
        method: 'PUT',
        body: JSON.stringify({ coinPriceKobo }),
      }),
  },

  games: {
    list: (all: boolean = false) =>
      request<{ games: Game[] }>(`/api/games${all ? '?all=true' : ''}`),
    create: (data: {
      name: string;
      category: GameCategory;
      description?: string;
      standardPriceKobo?: number;
      coinsRequired?: number;
      pricePerCoinKobo?: number;
    }) =>
      request<{ game: Game }>('/api/games', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: {
        name?: string;
        description?: string;
        standardPriceKobo?: number;
        coinsRequired?: number;
        pricePerCoinKobo?: number;
      }
    ) =>
      request<{ game: Game }>(`/api/games/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    toggleStatus: (id: string, isActive: boolean) =>
      request<{ game: Game }>(`/api/games/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
  },

  transactions: {
    quickCoins: (data: {
      coins: number;
      paymentMethod: PaymentMethod;
      paymentReference?: string;
      senderName?: string;
      customerName?: string;
    }) =>
      request<{ transaction: Transaction }>('/api/transactions/quick-coins', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    create: (data: {
      gameId?: string;
      quantity?: number;
      items?: Array<{ gameId: string; quantity: number }>;
      customerName?: string;
      paymentMethod: PaymentMethod;
      paymentReference?: string;
      senderName?: string;
    }) =>
      request<{ transaction: Transaction }>('/api/transactions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    list: (params: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
      gameId?: string;
      paymentMethod?: string;
      status?: string;
      cashierId?: string;
      businessDate?: string;
      startDate?: string;
      endDate?: string;
      sort?: string;
    } = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') query.append(k, String(v));
      });
      return request<{
        transactions: Transaction[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/api/transactions?${query.toString()}`);
    },
    get: (id: string) =>
      request<{ transaction: Transaction }>(`/api/transactions/${id}`),
    void: (id: string, reason: string) =>
      request<{ transaction: Transaction }>(`/api/transactions/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    correct: (
      id: string,
      data: { reason: string; paymentMethod?: PaymentMethod; paymentReference?: string }
    ) =>
      request<{ transaction: Transaction }>(`/api/transactions/${id}/correct`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    requestCorrection: (
      id: string,
      data: {
        reason: string;
        requestedAction: 'VOID' | 'CHANGE_PAYMENT_METHOD';
        proposedPaymentMethod?: PaymentMethod;
      }
    ) =>
      request<{ request: CorrectionRequest }>(
        `/api/transactions/${id}/request-correction`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
  },

  tabs: {
    list: (params: { status?: string; myTabs?: boolean; search?: string } = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.append('status', params.status);
      if (params.myTabs) query.append('myTabs', 'true');
      if (params.search) query.append('search', params.search);
      return request<{ tabs: CustomerTab[] }>(`/api/tabs?${query.toString()}`);
    },
    create: (data: {
      customerName: string;
      phoneNumber?: string;
      stationOrNote?: string;
      items?: Array<{ gameId: string; quantity: number }>;
    }) =>
      request<{ tab: CustomerTab }>('/api/tabs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: {
        customerName?: string;
        phoneNumber?: string;
        stationOrNote?: string;
        items?: Array<{ id?: string; gameId: string; quantity: number; addedAt?: string }>;
      }
    ) =>
      request<{ tab: CustomerTab }>(`/api/tabs/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/tabs/${id}`, {
        method: 'DELETE',
      }),
    checkout: (
      id: string,
      data: {
        paymentMethod: PaymentMethod;
        paymentReference?: string;
        senderName?: string;
      }
    ) =>
      request<{ transaction: Transaction; tab: CustomerTab }>(`/api/tabs/${id}/checkout`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  correctionRequests: {
    list: () => request<{ requests: CorrectionRequest[] }>('/api/correction-requests'),
    review: (id: string, action: 'APPROVE' | 'REJECT', adminNotes?: string) =>
      request<{ request: CorrectionRequest }>(`/api/correction-requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, adminNotes }),
      }),
  },

  reconciliation: {
    list: () => request<{ reconciliations: DailyReconciliation[] }>('/api/reconciliation'),
    getDay: (date: string) =>
      request<{ reconciliation: DailyReconciliation; isSaved: boolean }>(
        `/api/reconciliation/day/${date}`
      ),
    saveDay: (
      date: string,
      data: {
        actualCashKobo: number;
        actualPosKobo: number;
        actualTransferKobo: number;
        posTerminalReference?: string;
        bankSettlementTotalKobo?: number;
        notes?: string;
        statusOverride?: string;
        isReopenedEdit?: boolean;
      }
    ) =>
      request<{ reconciliation: DailyReconciliation }>(
        `/api/reconciliation/day/${date}`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    reopen: (date: string, reason: string) =>
      request<{ reconciliation: DailyReconciliation }>(
        `/api/reconciliation/day/${date}/reopen`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      ),
  },

  dashboard: {
    getStats: (params: {
      period?: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';
      startDate?: string;
      endDate?: string;
    } = {}) => {
      const query = new URLSearchParams();
      if (params.period) query.append('period', params.period);
      if (params.startDate) query.append('startDate', params.startDate);
      if (params.endDate) query.append('endDate', params.endDate);
      return request<{ stats: DashboardStats }>(`/api/dashboard/stats?${query.toString()}`);
    },
  },

  cashiers: {
    list: () =>
      request<{
        cashiers: (User & {
          totalTransactions: number;
          totalSalesKobo: number;
          todayTransactions: number;
          todaySalesKobo: number;
        })[];
      }>('/api/cashiers'),
    create: (data: { name: string; phoneNumber: string }) =>
      request<{ cashier: User }>('/api/cashiers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    toggleStatus: (id: string, isActive: boolean) =>
      request<{ cashier: User }>(`/api/cashiers/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    resetPassword: (id: string, newPassword: string) =>
      request<{ message: string }>(`/api/cashiers/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      }),
  },

  auditLogs: {
    list: (params: {
      page?: number;
      limit?: number;
      entityType?: string;
      action?: string;
      actorId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    } = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') query.append(k, String(v));
      });
      return request<{
        logs: AuditLog[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/api/audit-logs?${query.toString()}`);
    },
  },

  coins: {
    allocations: {
      list: (params: { cashierId?: string; startDate?: string; endDate?: string; status?: string } = {}) => {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') query.append(k, String(v));
        });
        const qs = query.toString();
        return request<{ allocations: CoinAllocation[] }>(`/api/coin-allocations${qs ? `?${qs}` : ''}`);
      },
      create: (data: { cashierId: string; initialCoins: number; notes?: string }) =>
        request<{ allocation: CoinAllocation }>('/api/coin-allocations', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      close: (id: string, data: { actualRemainingCoins: number; notes?: string }) =>
        request<{ allocation: CoinAllocation; expectedRemainingCoins: number; discrepancyCoins: number }>(
          `/api/coin-allocations/${id}/close`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        ),
    },
    balances: (params: { startDate?: string; endDate?: string } = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') query.append(k, String(v));
      });
      return request<{ balances: CashierCoinBalance[]; startDate: string; endDate: string }>(
        `/api/coin-balances?${query.toString()}`
      );
    },
    compensations: {
      list: (params: { cashierId?: string; startDate?: string; endDate?: string } = {}) => {
        const query = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') query.append(k, String(v));
        });
        const qs = query.toString();
        return request<{ compensations: CoinCompensation[] }>(`/api/coin-compensations${qs ? `?${qs}` : ''}`);
      },
      create: (data: {
        cashierId?: string;
        customerName: string;
        gameId?: string;
        gameName: string;
        coinsIssued: number;
        reason: string;
        notes?: string;
      }) =>
        request<{ compensation: CoinCompensation }>('/api/coin-compensations', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
  },

  bankAccounts: {
    list: () => request<{ accounts: BankAccount[] }>('/api/bank-accounts'),
    updateSlot: (
      slot: 1 | 2 | 3,
      data: {
        bankName: string;
        accountNumber: string;
        accountName: string;
        label?: string;
        isActive?: boolean;
      }
    ) =>
      request<{ account: BankAccount }>(`/api/bank-accounts/${slot}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
};
