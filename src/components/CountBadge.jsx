import { cn } from '@/lib/utils';

/** A small red count: 1–99, then "99+". */
export default function CountBadge({ n, label, className }) {
  return (
    <span
      aria-label={label}
      className={cn(
        'grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-destructive-foreground',
        className,
      )}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}
