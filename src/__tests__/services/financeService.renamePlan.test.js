// A payment carries its own title so it can stand alone in a search, an export,
// or a filtered ledger — which makes that title a snapshot of the obligation's
// name at the moment it was recorded. Renaming the obligation has to follow
// through, or the payments end up naming something that no longer exists.
//
// These pin that follow-through, and the limit on it: a payment the treasurer
// renamed by hand keeps the name they gave it.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Harness ───────────────────────────────────────────────────────────────────

// Stands in for the PostgREST builder, modelling only the chains
// updateTransaction uses:
//   .select('title').eq('id', txId).maybeSingle()
//   .update(row).eq('id', txId)
//   .update(row).eq('installment_of_tx_id', txId).eq('title', oldTitle)
const state = vi.hoisted(() => ({ currentTitle: null, updates: [] }));

vi.mock('../../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { title: state.currentTitle }, error: null }) }),
      }),
      update: (row) => {
        const call = { row, filters: {} };
        const query = {
          eq(column, value) {
            call.filters[column] = value;
            return this;
          },
          then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
        };
        state.updates.push(call);
        return query;
      },
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));

vi.mock('../../services/auditService', () => ({ logAuditEvent: vi.fn() }));

const { financeService } = await import('../../services/financeService');

const rowUpdate = () => state.updates.find((u) => 'id' in u.filters);
const childUpdate = () => state.updates.find((u) => 'installment_of_tx_id' in u.filters);

beforeEach(() => {
  state.currentTitle = 'Practice Jerseys';
  state.updates = [];
});

describe('renaming an obligation that is being paid off', () => {
  it('carries the new name through to its payments', async () => {
    await financeService.updateTransaction('tx1', { title: 'Practice/Training Jerseys' });

    expect(rowUpdate().row.title).toBe('Practice/Training Jerseys');
    expect(childUpdate()).toMatchObject({
      row: { title: 'Payment: Practice/Training Jerseys' },
      filters: { installment_of_tx_id: 'tx1', title: 'Payment: Practice Jerseys' },
    });
  });

  it('leaves the payments alone when the name has not changed', async () => {
    await financeService.updateTransaction('tx1', { title: 'Practice Jerseys', amount: 40 });

    expect(rowUpdate()).toBeTruthy();
    expect(childUpdate()).toBeUndefined();
  });

  it('does not go looking for a rename when the title was not being edited', async () => {
    await financeService.updateTransaction('tx1', { cleared: true, clearedDate: '2026-08-26' });

    expect(childUpdate()).toBeUndefined();
  });
});
