import { cn } from '@/lib/utils';

/**
 * PageTabs — the in-page tab row (Payments · Paperwork · Details, Upcoming ·
 * Past · Calendar, Overview · Roster). One component so every page switches
 * the same way.
 *
 * It sticks under the app header while the page scrolls (see `.page-tabs` in
 * index.css): on a phone the panes are long, and having to scroll back to the
 * top to switch was the main thing slowing a parent down. Each tab is a full
 * 44px touch target.
 *
 * `tabs`: [{ id, label, count? }]. `trailing` renders at the far end of the
 * row on wider screens — page actions that belong with the tabs.
 */
export default function PageTabs({ tabs = [], active, onChange, label, trailing, className }) {
  return (
    <div className={cn('page-tabs', className)}>
      <div role="tablist" aria-label={label} className="no-scrollbar flex h-full min-w-0 flex-1 gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative flex h-full shrink-0 items-center gap-1.5 px-3 text-sm font-semibold transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count != null && (
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{tab.count}</span>
              )}
              {isActive && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      {trailing && <div className="ml-2 hidden shrink-0 items-center gap-2 md:flex">{trailing}</div>}
    </div>
  );
}
