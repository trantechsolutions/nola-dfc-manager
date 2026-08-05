import { cn } from '@/lib/utils';

// Bootstrap's `.text-bg-*` pairs. Note which ones take BLACK text — info and
// warning are light enough that white fails contrast, and Bootstrap flips them
// for exactly that reason. `secondary` and `dark` are literal Bootstrap greys
// (#6c757d / #212529) rather than tokens because they are fixed in both themes,
// like every other badge fill.
const TONES = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-[#6c757d] text-white',
  success: 'bg-success text-success-foreground',
  info: 'bg-accent text-accent-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-destructive text-destructive-foreground',
  dark: 'bg-[#212529] text-white',
};

/**
 * Badge — AdminLTE / Bootstrap `.badge.text-bg-*`.
 *
 * Bootstrap metrics: .35em/.65em padding, 75% font size, weight 700, and the
 * standard border radius.
 */
export default function Badge({ tone = 'secondary', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-[0.65em] py-[0.35em] text-[0.75rem] font-bold leading-none',
        TONES[tone] ?? TONES.secondary,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
