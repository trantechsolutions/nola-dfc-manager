import { useLocation } from 'react-router-dom';
import LedgerView from './LedgerView';
import BudgetView from './BudgetView';
import SponsorsView from './SponsorsView';

export default function FinanceView({
  defaultTab = 'ledger',
  ledgerProps,
  budgetProps,
  fundraisingProps,
  visibleTabs,
}) {
  const { pathname } = useLocation();
  // Extract tab from path: /finance/budget → "budget"
  const pathTab = pathname.split('/finance/')[1] || '';
  const activeTab = pathTab || defaultTab;

  return (
    <>
      {activeTab === 'ledger' && ledgerProps && <LedgerView {...ledgerProps} />}
      {activeTab === 'budget' && budgetProps && <BudgetView {...budgetProps} />}
      {activeTab === 'fundraising' && fundraisingProps && <SponsorsView {...fundraisingProps} />}
    </>
  );
}
