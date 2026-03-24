import { useState, useEffect } from 'react';

export default function TabContainer({ tabs, defaultTab, children }) {
  const [activeTab, setActiveTab] = useState(() => (tabs.some((t) => t.id === defaultTab) ? defaultTab : tabs[0]?.id));

  // Sync with external defaultTab changes (e.g., URL params)
  useEffect(() => {
    if (defaultTab && tabs.some((t) => t.id === defaultTab)) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, tabs]);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === t.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
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
