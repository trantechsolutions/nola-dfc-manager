// Reconciliation state → AdminLTE card accent (see components/layout/AdminCard).
//
// Green once the account ties out, amber while a stated figure is entered but
// still off, plain until it is touched or after the month is locked. Its own
// module rather than an export on a card component: a non-component export
// breaks React Fast Refresh for that file.
export function cardVariant({ locked, hasEntry, isBalanced }) {
  if (locked || !hasEntry) return 'none';
  return isBalanced ? 'success' : 'warning';
}
