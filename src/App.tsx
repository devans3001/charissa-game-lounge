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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono">Initializing Game Lounge System...</span>
        </div>
      </div>
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
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
