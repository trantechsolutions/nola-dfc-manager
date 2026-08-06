import { cn } from '@/lib/utils';

/**
 * FormRow — AdminLTE's `.form-group.row`: a `col-sm-*` label beside a
 * `col-sm-*` control, collapsing to stacked on narrow viewports.
 *
 * `htmlFor` should match the control's id so the label click-target works;
 * pass `as="legend"` style grouping via `label={null}` when the control is a
 * fieldset that labels itself.
 */
export default function FormRow({ label, htmlFor, help, children, className }) {
  return (
    <div className={cn('grid gap-1.5 sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)] sm:gap-4', className)}>
      {label && (
        // Bootstrap's `.col-form-label` carries the input's own vertical padding
        // so the text sits on the control's first line rather than its top edge.
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground sm:pt-2">
          {label}
        </label>
      )}
      <div className={cn('min-w-0 space-y-1.5', !label && 'sm:col-span-2')}>
        {children}
        {help && <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>}
      </div>
    </div>
  );
}
