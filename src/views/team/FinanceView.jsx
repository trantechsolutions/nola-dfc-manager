import { useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || defaultTab;

  return (
    <>
      {activeTab === 'ledger' && ledgerProps && <LedgerView {...ledgerProps} />}
      {activeTab === 'budget' && budgetProps && <BudgetView {...budgetProps} />}
      {activeTab === 'fundraising' && fundraisingProps && <SponsorsView {...fundraisingProps} />}
    </>
  );
}
