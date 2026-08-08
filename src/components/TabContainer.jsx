import { useState, useEffect } from 'react';

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
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon && <t.icon size={14} />}
            {t.label}
          </button>
        ))}
      </div>
      {children(activeTab)}
    </div>
  );
}
