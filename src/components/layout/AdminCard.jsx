import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// AdminLTE's `card-outline card-<variant>` accent — a 3px rule along the top
// edge that colour-codes the card without tinting the whole surface.
const ACCENTS = {
  none: '',
  primary: 'border-t-[3px] border-t-primary',
  accent: 'border-t-[3px] border-t-accent',
  success: 'border-t-[3px] border-t-success',
  warning: 'border-t-[3px] border-t-warning',
  destructive: 'border-t-[3px] border-t-destructive',
};

// Bootstrap's `--bs-card-cap-bg`: a 3% tint of the body colour. On a card that
// shares the page background this is the only thing separating cap and footer
// from the body, so it is not decorative.
const CAP_BG = 'bg-foreground/[0.03]';

/**
 * AdminCard — AdminLTE `.card`.
 *
 * Structure: header (title + tools) / body / optional footer. The collapse and
 * remove tools mirror AdminLTE's `data-lte-toggle` buttons; both are opt-in.
 *
 * `onRemove` is intentionally a callback rather than internal state — the
 * parent owns whether a dismissed card stays dismissed across a remount.
 */
export default function AdminCard({
  title,
  subtitle,
  icon: Icon,
  variant = 'none',
  collapsible = false,
  defaultCollapsed = false,
  onRemove,
  tools,
  footer,
  className,
  bodyClassName,
  children,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // The header wraps rather than squeezes — AdminLTE's is a col-md-4 title /
  // col-md-8 tools row, so a header carrying a search box plus buttons has to
  // be able to drop to its own line on narrow viewports.
  const hasHeader = Boolean(title || subtitle || Icon || tools || collapsible || onRemove);

  return (
    <section
      className={cn(
        'mb-5 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm',
        ACCENTS[variant] ?? ACCENTS.none,
        className,
      )}
    >
      {hasHeader && (
        <header className={cn('flex flex-wrap items-center gap-2 border-b border-border px-4 py-3', CAP_BG)}>
          {Icon && <Icon size={16} className="shrink-0 text-muted-foreground" />}
          {/* `subtitle` rides on the title's own line rather than stacking
              beneath it: in a grid of cards a second header line would only
              appear on the cards that have one, leaving their bodies starting
              lower than their neighbours'. */}
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
            {title}
            {subtitle && <span className="ml-2 text-xs font-normal text-muted-foreground">{subtitle}</span>}
          </h3>
          <div className="ml-auto flex items-center gap-1">
            {tools}
            {collapsible && (
              <CardTool
                label={collapsed ? 'Expand' : 'Collapse'}
                icon={collapsed ? Plus : Minus}
                onClick={() => setCollapsed((v) => !v)}
                expanded={!collapsed}
              />
            )}
            {onRemove && <CardTool label="Remove" icon={X} onClick={onRemove} />}
          </div>
        </header>
      )}

      {!collapsed && (
        <>
          <div className={cn('p-4', bodyClassName)}>{children}</div>
          {footer && <div className={cn('border-t border-border px-4 py-3 text-sm', CAP_BG)}>{footer}</div>}
        </>
      )}
    </section>
  );
}

function CardTool({ icon, label, onClick, expanded }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon size={15} />
    </button>
  );
}
