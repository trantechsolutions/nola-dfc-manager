import { cn } from '@/lib/utils';

/**
 * SettingsShell — AdminLTE v4 `pages/settings.html`.
 *
 * That page is a `col-md-3` vertical `nav-pills` rail beside a `col-md-9`
 * `tab-content`. Below Bootstrap's md breakpoint the columns stack, which turns
 * the rail into a full-width stack of links and pushes the actual settings off
 * screen — so here the pills switch axis to a horizontal scroller instead.
 *
 * No width cap: every page in the app runs to the full `.app-content` width, and
 * a container here would leave settings as a narrow column on a wide monitor
 * while the rest of the app filled the viewport.
 *
 * `sections`: [{ id, label, icon? }]. The caller renders the active pane; this
 * owns the chrome and the selection affordance only.
 */
export default function SettingsShell({ sections = [], active, onChange, className, children }) {
  return (
    <div className={cn('grid items-start gap-4 md:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)]', className)}>
      <nav
        aria-label="Settings sections"
        // The negative margin lets the focus ring on the first/last pill breathe
        // without the scroller clipping it.
        className="-mx-1 overflow-x-auto px-1 pb-1 md:mx-0 md:overflow-visible md:px-0 md:pb-0"
      >
        <ul role="tablist" className="flex gap-1 md:flex-col">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === active;
            return (
              <li key={section.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onChange(section.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {Icon && <Icon size={15} className="shrink-0" />}
                  <span className="truncate">{section.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div role="tabpanel" className="min-w-0">
        {children}
      </div>
    </div>
  );
}
