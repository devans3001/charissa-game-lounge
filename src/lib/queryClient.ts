import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000, // 5 seconds
      gcTime: 1000 * 60 * 15, // 15 minutes cache
      refetchOnWindowFocus: true, // Refetch when tab is refocused
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const queryKeys = {
  dashboard: (period: string, startDate?: string, endDate?: string) =>
    ['dashboard', { period, startDate, endDate }] as const,
  transactions: (params: Record<string, any>) =>
    ['transactions', params] as const,
  games: () => ['games'] as const,
  coinPrice: () => ['coinPrice'] as const,
  cashierCoinBalance: (cashierId?: string) =>
    ['cashierCoinBalance', cashierId || 'self'] as const,
  coinBalances: () => ['coinBalances'] as const,
  coinAllocations: () => ['coinAllocations'] as const,
  coinCompensations: () => ['coinCompensations'] as const,
  cashiers: () => ['cashiers'] as const,
  reconciliation: (date: string) => ['reconciliation', date] as const,
  correctionRequests: () => ['correctionRequests'] as const,
  auditLogs: (params: Record<string, any>) => ['auditLogs', params] as const,
  bankAccounts: () => ['bankAccounts'] as const,
  customerTabs: () => ['customerTabs'] as const,
};
