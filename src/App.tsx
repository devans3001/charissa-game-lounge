import React, { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, Navigate, useRouteError } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient.ts';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginView } from './components/LoginView.tsx';
import { Navigation } from './components/Navigation.tsx';
import { NewSaleView } from './components/NewSaleView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { ReconciliationView } from './components/ReconciliationView.tsx';
import { TransactionsView } from './components/TransactionsView.tsx';
import { GameManagementView } from './components/GameManagementView.tsx';
import { CashierManagementView } from './components/CashierManagementView.tsx';
import { AuditLogsView } from './components/AuditLogsView.tsx';
import { CorrectionRequestsView } from './components/CorrectionRequestsView.tsx';
import { CoinVaultView } from './components/CoinVaultView.tsx';
import { BankAccountsView } from './components/BankAccountsView.tsx';
import { GameBootLoadingScreen } from './components/game-ui/index.ts';

// ========== 1. Layout: Shared shell (boot screen + navigation bar + Outlet) ==========
function RootLayout() {
  const { user, isLoading } = useAuth();
  const [bootComplete, setBootComplete] = React.useState(false);

  if (isLoading || !bootComplete) {
    return (
      <GameBootLoadingScreen
        minDurationMs={1600}
        onComplete={() => setBootComplete(true)}
      />
    );
  }

  if (!user) {
    return <LoginView />;
  }

  // Navigation no longer needs activeTab / onSelectTab props, uses NavLink internally for automatic highlighting
  return (
    <Navigation>
      <Outlet />
    </Navigation>
  );
}

// ========== 2. Admin Guard: Redirect non-admin users ==========
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

// ========== 3. Cashier Redirect: After cashier login, redirect to newsale ==========
function CashierRedirect() {
  const { user } = useAuth();
  // if (user?.role === 'CASHIER') {
  //   return <Navigate to="/newsale" replace />;
  // }
  return <DashboardView />;
}

function RouteErrorBoundary() {
  const error = useRouteError();
  console.error('Route error:', error);
  return (
    <div className="p-8 text-slate-200">
      <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
      <pre className="text-xs text-rose-400 whitespace-pre-wrap">
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </div>
  );
}


// ========== 4. Router Configuration ==========
const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthProvider>
        <RootLayout />
      </AuthProvider>
    ),
     errorElement: <RouteErrorBoundary />,
    children: [
      // Default route: cashier redirected to newsale, admin sees Dashboard
      { index: true, element: <CashierRedirect /> },

      { path: 'newsale', element: <NewSaleView /> },
      { path: 'transactions', element: <TransactionsView /> },
      { path: 'reconciliation', element: (
        <AdminGuard><ReconciliationView /></AdminGuard>
      )},
      { path: 'games', element: (
        <AdminGuard><GameManagementView /></AdminGuard>
      )},
      { path: 'cashiers', element: (
        <AdminGuard><CashierManagementView /></AdminGuard>
      )},
      { path: 'coinvault', element: <CoinVaultView /> },
      { path: 'bank_accounts', element: (
        <AdminGuard><BankAccountsView /></AdminGuard>
      )},
      { path: 'correction_requests', element: <CorrectionRequestsView /> },
      { path: 'audit', element: (
        <AdminGuard><AuditLogsView /></AdminGuard>
      )},
    ],
  },
]);

// ========== 5. App Export ==========
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      
        <RouterProvider router={router} />
      {/* </AuthProvider> */}
    </QueryClientProvider>
  );
}