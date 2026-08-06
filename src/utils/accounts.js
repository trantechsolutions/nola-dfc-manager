/**
 * Which of a team's accounts a parent is allowed to be shown as a way to pay.
 *
 * Three gates, all deliberate: archived accounts are history, private accounts
 * are internal ledger buckets (Chase Checking, Uncategorized) nobody can pay
 * into, and a published account with no handle has nothing to show a parent —
 * they'd see a name and no way to act on it.
 *
 * RLS enforces the isPublic half server-side (sql/add_account_parent_visibility.sql),
 * so a guardian's query never returns the internal rows in the first place.
 * This predicate is the display half, and it matters for the readers RLS does
 * NOT narrow: a staff member previewing "view as parent", or a coach whose own
 * child is on the team. Both hold roles that return every account.
 */
export function isPayableAccount(account) {
  return Boolean(account?.isActive && account?.isPublic && account?.handle && account.handle.trim());
}
