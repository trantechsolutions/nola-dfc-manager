import { cn } from '@/lib/utils';

const TONES = {
  primary: 'bg-primary text-primary-foreground',
  accent: 'bg-accent text-accent-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  muted: 'bg-muted text-foreground',
};

/**
 * InfoBox — AdminLTE `.info-box`. The quieter sibling of SmallBox: a white
 * card with a single colour-filled icon tile, for stats that shouldn't
 * dominate the page the way a solid-fill SmallBox does.
 */
export default function InfoBox({ value, label, icon: Icon, tone = 'primary', progress, progressLabel, className }) {
  return (
    <div
      className={cn(
        'mb-5 flex items-stretch overflow-hidden rounded-md border border-border bg-card shadow-sm',
        className,
      )}
    >
      {Icon && (
        <div className={cn('grid w-[70px] shrink-0 place-items-center', TONES[tone] ?? TONES.primary)}>
          <Icon size={28} strokeWidth={1.75} />
        </div>
      )}
      <div className="min-w-0 flex-1 px-4 py-3">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-bold tracking-tight text-card-foreground">{value}</p>
        {typeof progress === 'number' && (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', TONES[tone] ?? TONES.primary)}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            {progressLabel && <p className="mt-1 text-xs text-muted-foreground">{progressLabel}</p>}
          </>
        )}
      </div>
    </div>
  );
}
