import { supabase } from '../supabase';

// What a person has turned off. The database leaves them out when it works out who a notification goes to
// (notification_recipients in sql/notifications_migration.sql); broadcasts and alerts about their own child
// can't be turned off.
export const MUTABLE_KINDS = ['chat', 'schedule', 'reminder'];

export const muteScope = {
  kind: (kind) => `kind:${kind}`,
  teamChat: (teamId) => `team-chat:${teamId}`,
  thread: (threadId) => `thread:${threadId}`,
};

export const notificationPrefs = {
  /** The set of scopes this person has muted. */
  async list() {
    const { data, error } = await supabase.from('notification_mutes').select('scope');
    if (error) throw error;
    return new Set((data || []).map((r) => r.scope));
  },

  async setMuted(scope, muted) {
    const { error } = muted
      ? await supabase.from('notification_mutes').upsert({ scope }, { onConflict: 'user_id,scope' })
      : await supabase.from('notification_mutes').delete().eq('scope', scope);
    if (error) throw error;
  },
};
