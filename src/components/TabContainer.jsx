import { useState, useEffect } from 'react';
import PageTabs from './layout/PageTabs';

export default function TabContainer({ tabs, defaultTab, children }) {
  const [activeTab, setActiveTab] = useState(() => (tabs.some((t) => t.id === defaultTab) ? defaultTab : tabs[0]?.id));

  // A primitive key rather than the array itself. Callers build `tabs` inline,
  // so it is a new identity every render; as an effect dependency it re-ran the
  // sync below on every parent re-render and snapped the user back to
  // `defaultTab` — a toast after a save was enough to lose the open tab.
  const tabIds = tabs.map((t) => t.id).join(',');

  // Sync with a real change: a new defaultTab (e.g. URL params) or a change in
  // which tabs exist at all (e.g. permissions resolving).
  useEffect(() => {
    if (defaultTab && tabIds.split(',').includes(defaultTab)) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, tabIds]);

  return (
    <div className="space-y-5">
      <PageTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {children(activeTab)}
    </div>
  );
}
