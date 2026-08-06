import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * SettingsToggle — AdminLTE's `.custom-control.custom-switch` row: a switch
 * with a label and a muted line of help text explaining what it changes.
 *
 * Rendered as a real `role="switch"` button rather than a checkbox so the
 * on/off state is announced without a visually-hidden input to keep in sync.
 */
export default function SettingsToggle({ label, help, checked = false, onChange, disabled = false, className }) {
  const labelId = useId();

  return (
    <div className={cn('flex items-start justify-between gap-4 py-1', className)}>
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium text-foreground">
          {label}
        </p>
        {help && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{help}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
