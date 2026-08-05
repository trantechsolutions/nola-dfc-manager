import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Solid-fill tones. Each pairs a background token with its matching
// foreground token so contrast holds in both light and dark themes.
const TONES = {
  primary: 'bg-primary text-primary-foreground',
  accent: 'bg-accent text-accent-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  muted: 'bg-muted text-foreground',
};

// Matches AdminLTE's `.small-box > .small-box-footer`: rgba(0,0,0,.07),
// deepening to .1 on hover.
const FOOTER_LINK_CLASS =
  'relative z-10 flex w-full items-center justify-center gap-1.5 bg-black/[0.07] py-1.5 text-xs font-semibold transition-colors hover:bg-black/10';

/**
 * SmallBox — AdminLTE `.small-box` stat widget.
 *
 * Big number, label underneath, oversized watermark icon bleeding off the
 * right edge, and an optional "more info" footer link along the bottom.
 */
export default function SmallBox({ value, label, icon: Icon, tone = 'primary', href, onClick, linkLabel, className }) {
  const isLink = Boolean(href || onClick);

  return (
    <div className={cn('relative mb-5 overflow-hidden rounded-md shadow-sm', TONES[tone] ?? TONES.primary, className)}>
      <div className="relative z-10 p-4">
        <p className="text-3xl font-bold leading-tight tracking-tight">{value}</p>
        <p className="text-sm font-medium opacity-90">{label}</p>
      </div>

      {Icon && (
        <Icon
          size={80}
          strokeWidth={1.5}
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 top-1 opacity-20 transition-transform duration-300"
        />
      )}

      {isLink &&
        (href ? (
          <a href={href} className={FOOTER_LINK_CLASS}>
            {linkLabel || 'More info'}
            <ArrowRight size={13} />
          </a>
        ) : (
          <button type="button" onClick={onClick} className={FOOTER_LINK_CLASS}>
            {linkLabel || 'More info'}
            <ArrowRight size={13} />
          </button>
        ))}
    </div>
  );
}
