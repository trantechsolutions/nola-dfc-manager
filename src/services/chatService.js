import { supabase } from '../supabase';

// Team chat (sql/team_chat_migration.sql, sql/chat_threads_migration.sql): each team's chat for its staff and
// families, plus private and group chats between people on the same team. Row-level security decides who reads
// and posts; these calls only ask.
//
// A conversation is { kind: 'team' | 'direct' | 'group', id, teamId }: for a team chat `id` is the team's id,
// otherwise the chat's.

export const PAGE_SIZE = 50;

// Before a migration has run: an empty chat, not an error screen.
const missing = (error) =>
  ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code) ||
  /team_messages|chat_inbox|chat_people|team_chat_settings/.test(error?.message || '');
// A column the database doesn't have yet (thread_id before sql/chat_threads_migration.sql).
const missingColumn = (error) => error?.code === '42703' || error?.code === 'PGRST204';

const toMessage = (m) => ({
  id: m.id,
  teamId: m.team_id,
  threadId: m.thread_id || null,
  authorId: m.author_id,
  authorName: m.author_name || '',
  authorRole: m.author_role || 'family',
  body: m.body || '',
  clientId: m.client_id || null,
  createdAt: m.created_at,
  editedAt: m.edited_at || null,
  deletedAt: m.deleted_at || null,
});

/** A stable key for a conversation, used in lists and the address. */
export const conversationKey = (c) => (c.kind === 'team' ? `team:${c.id}` : `chat:${c.id}`);

export const chatService = {
  toMessage,

  /**
   * Every conversation this person is in, newest first:
   * [{ kind, id, teamId, teamName, title, unread, lastBody, lastAuthor, lastAt, members, closed, canStart }]
   */
  async getInbox() {
    const { data, error } = await supabase.rpc('chat_inbox');
    if (error) {
      if (missing(error)) return [];
      throw error;
    }
    return (data || []).map((r) => ({
      kind: r.kind || 'team',
      id: r.id || r.team_id,
      teamId: r.team_id,
      teamName: r.team_name || '',
      title: r.title || r.team_name || '',
      unread: r.unread || 0,
      lastBody: r.last_body || '',
      lastAuthor: r.last_author || '',
      lastAt: r.last_at || null,
      members: r.members ?? null,
      closed: !!r.closed,
      canStart: !!r.can_start,
      canManage: !!r.can_manage,
    }));
  },

  /**
   * For a team admin: the team's private and group chats they aren't in, to read and moderate
   * (sql/chat_admin_oversight_migration.sql). Same shape as the inbox, with `oversight: true`.
   */
  async getOversight(teamId) {
    const { data, error } = await supabase.rpc('chat_oversight', { p_team_id: teamId });
    if (error) {
      if (missing(error) || /chat_oversight/.test(error.message || '')) return [];
      throw error;
    }
    return (data || []).map((r) => ({
      kind: r.kind,
      id: r.id,
      teamId: r.team_id,
      teamName: r.team_name || '',
      title: r.title || '',
      unread: 0,
      lastBody: r.last_body || '',
      lastAuthor: r.last_author || '',
      lastAt: r.last_at || null,
      members: r.members ?? null,
      closed: !!r.closed,
      canStart: false,
      canManage: true,
      oversight: true,
    }));
  },

  /** A page of a conversation's messages, oldest first, ending before `before` (an ISO time) when given. */
  async getMessages(conv, { before = null } = {}) {
    const query = (scoped) => {
      let q = supabase.from('team_messages').select('*');
      if (conv.kind === 'team') {
        q = q.eq('team_id', conv.id);
        if (scoped) q = q.is('thread_id', null);
      } else q = q.eq('thread_id', conv.id);
      q = q.order('created_at', { ascending: false }).limit(PAGE_SIZE);
      return before ? q.lt('created_at', before) : q;
    };
    let { data, error } = await query(true);
    if (error && missingColumn(error) && conv.kind === 'team') ({ data, error } = await query(false));
    if (error) {
      if (missing(error)) return [];
      throw error;
    }
    return (data || []).map(toMessage).reverse();
  },

  /** Posts a message. `clientId` makes a retry after a dropped connection land once. */
  async send(conv, body, clientId) {
    const row = {
      team_id: conv.teamId,
      body,
      client_id: clientId,
      ...(conv.kind === 'team' ? {} : { thread_id: conv.id }),
    };
    const { data, error } = await supabase.from('team_messages').insert(row).select('*').single();
    if (error) {
      // Already stored by an earlier attempt that lost its answer: fetch that one.
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('team_messages')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle();
        if (existing) return toMessage(existing);
      }
      throw error;
    }
    return toMessage(data);
  },

  async edit(id, body) {
    const { data, error } = await supabase.from('team_messages').update({ body }).eq('id', id).select('*').single();
    if (error) throw error;
    return toMessage(data);
  },

  /** Removes a message: it stays in the conversation as "message removed". */
  async remove(id) {
    const { data, error } = await supabase
      .from('team_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return toMessage(data);
  },

  /** Everything in the conversation up to now counts as read. */
  async markRead(conv) {
    const { error } =
      conv.kind === 'team'
        ? await supabase
            .from('team_chat_reads')
            .upsert({ team_id: conv.id, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,team_id' })
        : await supabase.rpc('chat_mark_thread_read', { p_thread_id: conv.id });
    if (error && !missing(error)) throw error;
  },

  /** Everyone on a team this person can chat with: [{ userId, name, role: 'staff' | 'family', detail }]. */
  async getPeople(teamId) {
    const { data, error } = await supabase.rpc('chat_people', { p_team_id: teamId });
    if (error) {
      if (missing(error)) return [];
      throw error;
    }
    return (data || []).map((p) => ({ userId: p.user_id, name: p.name || '', role: p.role, detail: p.detail || '' }));
  },

  /** Who's in a private or group chat: [userId]. */
  async getMembers(threadId) {
    const { data, error } = await supabase.from('chat_thread_members').select('user_id').eq('thread_id', threadId);
    if (error) throw error;
    return (data || []).map((m) => m.user_id);
  },

  /** Starts (or, for two people, reopens) a chat on a team with these people. Returns the chat's id. */
  async start(teamId, userIds, title = null) {
    const { data, error } = await supabase.rpc('chat_start', {
      p_team_id: teamId,
      p_user_ids: userIds,
      p_title: title || null,
    });
    if (error) throw error;
    return data;
  },

  async addMembers(threadId, userIds) {
    const { error } = await supabase.rpc('chat_add_members', { p_thread_id: threadId, p_user_ids: userIds });
    if (error) throw error;
  },

  async leave(threadId) {
    const { error } = await supabase.rpc('chat_leave', { p_thread_id: threadId });
    if (error) throw error;
  },

  async rename(threadId, title) {
    const { error } = await supabase.rpc('chat_rename', { p_thread_id: threadId, p_title: title });
    if (error) throw error;
  },

  async close(threadId) {
    const { error } = await supabase.rpc('chat_close', { p_thread_id: threadId });
    if (error) throw error;
  },

  /** Who may start chats on a team: 'everyone' | 'staff' | 'none'. */
  async getStartPolicy(teamId) {
    const { data, error } = await supabase
      .from('team_chat_settings')
      .select('start_policy')
      .eq('team_id', teamId)
      .maybeSingle();
    if (error) {
      if (missing(error)) return 'everyone';
      throw error;
    }
    return data?.start_policy || 'everyone';
  },

  async setStartPolicy(teamId, policy) {
    const { error } = await supabase.rpc('chat_set_policy', { p_team_id: teamId, p_policy: policy });
    if (error) throw error;
  },

  /** The name others see for this person, in chat and elsewhere in the app. */
  async setMyName(userId, name) {
    const { error } = await supabase.from('user_profiles').update({ display_name: name }).eq('user_id', userId);
    if (error) throw error;
  },
};
