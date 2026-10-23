import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { chatService } from '../services/chatService';

/**
 * The person's team chats and how many messages in each they haven't read, shared by the chat bubble in the
 * top bar and the chat screen. Kept live: any new message the person can see (row-level security filters the
 * stream) refreshes the counts.
 */
const ChatContext = createContext({ inbox: [], totalUnread: 0, refresh: () => {}, ready: false });

export function ChatProvider({ userId, children }) {
  const [inbox, setInbox] = useState([]);
  const [ready, setReady] = useState(false);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      setInbox(await chatService.getInbox());
    } catch (err) {
      console.warn('[chat] inbox:', err?.message);
    } finally {
      setReady(true);
    }
  }, []);

  // Several messages in a burst cost one refresh.
  const soon = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 400);
  }, [refresh]);

  useEffect(() => {
    if (!userId) return undefined;
    refresh();
    const channel = supabase
      .channel(`chat-inbox-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, soon)
      // Added to (or taken out of) a private or group chat: it appears in, or leaves, the list.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_thread_members' }, soon)
      .subscribe();
    // Back from the background (a phone unlocked, a tab revisited): catch up on what was missed.
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, refresh, soon]);

  const value = useMemo(
    () => ({ inbox, ready, refresh, totalUnread: inbox.reduce((n, c) => n + (c.unread || 0), 0) }),
    [inbox, ready, refresh],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useChat = () => useContext(ChatContext);
