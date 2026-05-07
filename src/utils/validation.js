/**
 * Thin validation layer for data written to Supabase.
 * Each function returns null on success or a string error message on failure.
 */

export function validateTransaction(txData) {
  if (!txData.title || !txData.title.trim()) return 'Title is required.';

  const amount = Number(txData.amount);
  if (!isFinite(amount) || amount === 0) return 'Amount must be a non-zero number.';

  if (txData.date) {
    const d = new Date(typeof txData.date === 'string' ? txData.date : txData.date.seconds * 1000);
    if (isNaN(d.getTime())) return 'Date is invalid.';
  }

  if (!txData.category || !txData.category.trim()) return 'Category is required.';

  return null;
}

export function validatePlayer(playerData) {
  if (!playerData.firstName || !playerData.firstName.trim()) return 'First name is required.';
  if (!playerData.lastName || !playerData.lastName.trim()) return 'Last name is required.';

  if (playerData.birthdate) {
    const d = new Date(playerData.birthdate);
    if (isNaN(d.getTime())) return 'Birthdate is invalid.';
    const now = new Date();
    if (d > now) return 'Birthdate cannot be in the future.';
  }

  if (playerData.jerseyNumber !== null && playerData.jerseyNumber !== undefined && playerData.jerseyNumber !== '') {
    const n = Number(playerData.jerseyNumber);
    if (!isFinite(n) || n < 0 || n > 999) return 'Jersey number must be between 0 and 999.';
  }

  if (playerData.guardians) {
    for (const g of playerData.guardians) {
      if (g.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim())) {
        return `Guardian email "${g.email}" is not a valid email address.`;
      }
    }
  }

  return null;
}

export function validateBudgetItem(item) {
  if (!item.category || !item.category.trim()) return 'Category is required.';
  if (!item.label || !item.label.trim()) return 'Label is required.';

  for (const field of ['income', 'expensesFall', 'expensesSpring']) {
    const v = Number(item[field]);
    if (!isFinite(v) || v < 0) return `${field} must be a non-negative number.`;
  }

  return null;
}
