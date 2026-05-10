import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import LedgerView from './LedgerView';
import BudgetView from './BudgetView';
import SponsorsView from './SponsorsView';

const BookBalanceView = lazy(() => import('./BookBalanceView'));

function TabFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-800 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

export default function FinanceView({
  defaultTab = 'ledger',
  ledgerProps,
  budgetProps,
  fundraisingProps,
  bookBalanceProps,
  visibleTabs,
}) {
  const { pathname } = useLocation();
  // Extract tab from path: /finance/budget → "budget"
  const pathTab = pathname.split('/finance/')[1] || '';
  const activeTab = pathTab || defaultTab;

  return (
    <Suspense fallback={<TabFallback />}>
      {activeTab === 'ledger' && ledgerProps && <LedgerView {...ledgerProps} />}
      {activeTab === 'budget' && budgetProps && <BudgetView {...budgetProps} />}
      {activeTab === 'fundraising' && fundraisingProps && <SponsorsView {...fundraisingProps} />}
      {activeTab === 'book-balance' && bookBalanceProps && <BookBalanceView {...bookBalanceProps} />}
    </Suspense>
  );
}
