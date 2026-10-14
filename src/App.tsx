import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginView } from './components/LoginView.tsx';
import { Navigation, ActiveTab } from './components/Navigation.tsx';
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
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient.ts';


/// let each section have its own page/route, you wiil need to set up a router like react-router-dom



function MainApp() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Set intelligent initial tab on login
  React.useEffect(() => {
    if (user?.role === 'CASHIER') {
      setActiveTab('newsale');
    } else if (user?.role === 'ADMIN') {
      setActiveTab('dashboard');
    }
  }, [user?.role]);

  const [bootComplete, setBootComplete] = useState<boolean>(false);

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

  const isAdmin = user.role === 'ADMIN';

  return (
    <Navigation activeTab={activeTab} onSelectTab={setActiveTab}>
      {activeTab === 'newsale' && <NewSaleView />}
      {activeTab === 'dashboard' && (
        <DashboardView
          onNavigateToReconciliation={() => setActiveTab('reconciliation')}
          onNavigateToTransactions={() => setActiveTab('transactions')}
          onNavigateToNewSale={() => setActiveTab('newsale')}
        />
      )}
      {activeTab === 'transactions' && (
        <TransactionsView onNavigateToFixRequests={() => setActiveTab('correction_requests')} />
      )}
      {activeTab === 'reconciliation' && (isAdmin ? <ReconciliationView /> : <DashboardView />)}
      {activeTab === 'games' && (isAdmin ? <GameManagementView /> : <NewSaleView />)}
      {activeTab === 'cashiers' && (isAdmin ? <CashierManagementView /> : <DashboardView />)}
      {activeTab === 'coinvault' && <CoinVaultView />}
      {activeTab === 'bank_accounts' && (isAdmin ? <BankAccountsView /> : <DashboardView />)}
      {activeTab === 'correction_requests' && <CorrectionRequestsView />}
      {activeTab === 'audit' && (isAdmin ? <AuditLogsView /> : <DashboardView />)}
    </Navigation>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}
