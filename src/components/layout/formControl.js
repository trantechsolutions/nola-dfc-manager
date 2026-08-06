// AdminLTE's `.form-control` — shared so inputs, selects and textareas across
// the settings pages sit on the same height, radius and focus ring.
//
// Its own module rather than an export on FormRow.jsx: mixing a constant into a
// component file breaks React Fast Refresh for that file.
export const formControl =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring disabled:opacity-50';
