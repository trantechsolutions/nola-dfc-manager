import { cn } from '@/lib/utils';

/**
 * TabCard — AdminLTE's tabbed card, as used by `pages/profile.html`.
 *
 * The reference puts `nav-tabs` inside a `card-header p-0 border-bottom-0`, so
 * the active tab's bottom edge merges into the card body and reads as one
 * surface. That is what the `-mb-px` plus a card-coloured bottom border on the
 * active tab reproduces here — without both, the active tab floats above a
 * continuous rule and the joined-panel illusion breaks.
 *
 * `tabs`: [{ id, label, icon? }]. The caller renders the active pane itself.
 */
export default function TabCard({ tabs = [], active, onChange, className, bodyClassName, children }) {
  return (
    <section
      className={cn(
        'mb-5 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="border-b border-border bg-foreground/[0.03] px-2 pt-2">
        <div role="tablist" className="-mb-px flex flex-wrap gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-t-md border px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-border border-b-card bg-card text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {Icon && <Icon size={14} />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" className={cn('p-4', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
