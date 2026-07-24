import { Users, FileText } from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import TabContainer from '../../components/TabContainer';
import RosterManagement from './RosterManagement';
import DocumentManager from './DocumentManager';

export default function PeopleView({ defaultTab = 'roster', rosterProps, documentsProps, visibleTabs }) {
  const { t } = useT();

  const ALL_TABS = [
    { id: 'roster', label: t('nav.roster'), icon: Users },
    { id: 'documents', label: t('nav.documents'), icon: FileText },
  ];
  const tabs = ALL_TABS.filter((tab) => !visibleTabs || visibleTabs.includes(tab.id));

  return (
    <TabContainer tabs={tabs} defaultTab={defaultTab}>
      {(activeTab) => (
        <>
          {activeTab === 'roster' && rosterProps && <RosterManagement {...rosterProps} />}
          {activeTab === 'documents' && documentsProps && <DocumentManager {...documentsProps} />}
        </>
      )}
    </TabContainer>
  );
}
