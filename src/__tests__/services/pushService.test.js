import { describe, it, expect, vi, beforeEach } from 'vitest';

// Records what each call would write: notifications are queued as rows, never sent from the browser.
const state = vi.hoisted(() => ({ inserts: [], upserts: [], deletes: [], rpcs: [], error: null }));

vi.mock('../../supabase', () => ({
  supabase: {
    from: (table) => ({
      insert: (row) => {
        state.inserts.push({ table, row });
        return Promise.resolve({ error: state.error });
      },
      upsert: (row, options) => {
        state.upserts.push({ table, row, options });
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        eq: (column, value) => {
          state.deletes.push({ table, column, value });
          return Promise.resolve({ error: null });
        },
      }),
      select: () => Promise.resolve({ data: [{ scope: 'kind:chat' }, { scope: 'thread:abc' }], error: null }),
    }),
    rpc: (name, args) => {
      state.rpcs.push({ name, args });
      return Promise.resolve({ error: null });
    },
    functions: { invoke: vi.fn() },
  },
}));

const { pushService } = await import('../../services/pushService');
const { notificationPrefs, muteScope } = await import('../../services/notificationPrefs');
const { supabase } = await import('../../supabase');

beforeEach(() => {
  state.inserts = [];
  state.upserts = [];
  state.deletes = [];
  state.rpcs = [];
  state.error = null;
});

describe('pushService — queued notifications', () => {
  it('queues a broadcast as a row for the database to send, without calling the edge function', async () => {
    await pushService.broadcast({ teamId: 't1', title: 'U12', body: 'Field moved to Park 2', url: '/dashboard' });
    expect(state.inserts).toEqual([
      {
        table: 'notifications',
        row: {
          kind: 'broadcast',
          team_id: 't1',
          player_id: null,
          title: 'U12',
          body: 'Field moved to Park 2',
          url: '/dashboard',
          tag: null,
        },
      },
    ]);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('tags schedule changes per team so a run of edits collapses into one notification', async () => {
    await pushService.scheduleChange({ teamId: 't1', title: 'Practice moved', body: 'Now 6pm' });
    expect(state.inserts[0].row).toMatchObject({ kind: 'schedule', url: '/schedule', tag: 'schedule-t1' });
  });

  it('addresses a player alert to the player, for the database to find the family', async () => {
    await pushService.playerAlert({ teamId: 't1', playerId: 'p1', title: 'Ana — Waiver', body: 'Approved' });
    expect(state.inserts[0].row).toMatchObject({ kind: 'alert', team_id: 't1', player_id: 'p1' });
  });

  it('trims text to what the table accepts', async () => {
    await pushService.broadcast({ teamId: 't1', title: 'x'.repeat(200), body: 'y'.repeat(900) });
    expect(state.inserts[0].row.title).toHaveLength(120);
    expect(state.inserts[0].row.body).toHaveLength(500);
  });

  it('surfaces a save that was refused (not staff, or over the hourly cap)', async () => {
    state.error = new Error('too many notifications in the last hour');
    await expect(pushService.broadcast({ teamId: 't1', title: 'a', body: 'b' })).rejects.toThrow('too many');
  });

  it('files a browser subscription under the signed-in account through the RPC', async () => {
    await pushService.saveSubscription({ endpoint: 'https://push/1', keys: { p256dh: 'k', auth: 'a' } });
    expect(state.rpcs).toEqual([
      { name: 'save_push_subscription', args: { p_endpoint: 'https://push/1', p_p256dh: 'k', p_auth: 'a' } },
    ]);
  });
});

describe('notificationPrefs', () => {
  it('reads muted scopes as a set', async () => {
    const muted = await notificationPrefs.list();
    expect(muted.has('kind:chat')).toBe(true);
    expect(muted.has(muteScope.thread('abc'))).toBe(true);
  });

  it('mutes by upserting and unmutes by deleting the scope', async () => {
    await notificationPrefs.setMuted(muteScope.kind('reminder'), true);
    await notificationPrefs.setMuted(muteScope.teamChat('t1'), false);
    expect(state.upserts[0]).toMatchObject({ table: 'notification_mutes', row: { scope: 'kind:reminder' } });
    expect(state.deletes[0]).toEqual({ table: 'notification_mutes', column: 'scope', value: 'team-chat:t1' });
  });
});
