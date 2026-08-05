import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared header controls for DirectoryCard. AdminLTE's users.html sizes every
// header control to `input-group-sm` / `btn-sm`; these lock that to h-8 so the
// search box, filters and buttons line up on one row across all four
// directories instead of each page inventing its own heights.

export function DirectoryToolbar({ children, className }) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search', className }) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        size={14}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-8 w-40 rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring sm:w-52"
      />
    </div>
  );
}

/** `options`: [{ value, label }] */
export function FilterSelect({ value, onChange, options = [], label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const TONES = {
  primary: 'bg-primary text-primary-foreground hover:brightness-110',
  default: 'border border-border bg-card text-foreground hover:bg-muted',
};

export function ToolbarButton({ icon, tone = 'default', children, ...props }) {
  const Icon = icon;
  return (
    <button
      type="button"
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition-colors',
        TONES[tone] ?? TONES.default,
      )}
      {...props}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

/** Row-level icon button for a table's Actions column. */
export function RowAction({ icon, label, ...props }) {
  const Icon = icon;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      {...props}
    >
      <Icon size={13} />
    </button>
  );
}
