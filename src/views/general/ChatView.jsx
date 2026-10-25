import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Info,
  Loader2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  SquarePen,
  Trash2,
  User,
  Users,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '../../supabase';
import { useT } from '../../i18n/I18nContext';
import { useChat } from '../../context/ChatContext';
import { chatService, conversationKey, PAGE_SIZE } from '../../services/chatService';
import CountBadge from '../../components/CountBadge';
import { ResponsiveModal } from '../../components/layout';
import { formControl } from '../../components/layout/formControl';
import { useNotificationMutes } from '../../hooks/useNotificationMutes';
import { muteScope } from '../../services/notificationPrefs';

const newClientId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Messages from the same person within five minutes read as one run: the name shows once, at the top.
const RUN_MS = 5 * 60 * 1000;

const KIND_ICON = { team: Users, direct: User, group: UsersRound };

/**
 * Chat: each team's conversation for its staff and families, and private or group chats between people on the
 * same team. On a phone it's the list of chats, then one at a time; wider screens show both side by side.
 * The address names the conversation (?team=… or ?chat=…), so a push notification lands in the right one.
 */
export default function ChatView({ user }) {
  const { t } = useT();
  const { inbox, ready, refresh } = useChat();
  const [params, setParams] = useSearchParams();
  const [composing, setComposing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // A chat a team admin opened from "Review private chats": not in their inbox, read-only for them.
  const [reviewed, setReviewed] = useState(null);
  const teamParam = params.get('team');
  const chatParam = params.get('chat');
  const onlyTeam = inbox.length === 1 && inbox[0].kind === 'team' ? inbox[0] : null;
  const current =
    (chatParam && inbox.find((c) => c.kind !== 'team' && c.id === chatParam)) ||
    (chatParam && reviewed?.id === chatParam ? reviewed : null) ||
    (teamParam && inbox.find((c) => c.kind === 'team' && c.id === teamParam)) ||
    (!chatParam && !teamParam ? onlyTeam : null);
  const startable = inbox.filter((c) => c.kind === 'team' && c.canStart);
  const managed = inbox.filter((c) => c.kind === 'team' && c.canManage);
  const multiTeam = new Set(inbox.map((c) => c.teamId)).size > 1;

  const open = (c) => setParams(c ? (c.kind === 'team' ? { team: c.id } : { chat: c.id }) : {});

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!inbox.length) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <MessageCircle className="mx-auto mb-3" size={28} aria-hidden="true" />
        {t('chat.noTeams')}
      </div>
    );
  }

  return (
    // minmax(0,…) on phones too: an implicit column sizes to its widest line, and a truncated preview of a long
    // message is one unbroken line, so the list would stretch past the screen.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className={cn('space-y-3 md:block', current && 'hidden')}>
        <NamePrompt user={user} teamId={inbox[0]?.teamId} />
        {startable.length > 0 && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            <SquarePen size={15} aria-hidden="true" />
            {t('chat.newChat')}
          </button>
        )}
        <ChatList
          inbox={inbox}
          activeKey={current ? conversationKey(current) : null}
          onOpen={open}
          multiTeam={multiTeam}
        />
        {managed.length > 0 && (
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <ShieldCheck size={15} aria-hidden="true" />
            {t('chat.reviewChats')}
          </button>
        )}
      </aside>
      {current ? (
        <Thread
          key={conversationKey(current)}
          conv={current}
          user={user}
          multiTeam={multiTeam}
          onBack={onlyTeam && current.kind === 'team' ? null : () => open(null)}
          onRead={refresh}
          onLeft={async () => {
            await refresh();
            open(null);
          }}
        />
      ) : (
        <div className="hidden items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground md:flex">
          {t('chat.pickTeam')}
        </div>
      )}
      <ReviewChats
        open={reviewing}
        teams={managed}
        onClose={() => setReviewing(false)}
        onOpen={(c) => {
          setReviewing(false);
          setReviewed(c);
          setParams({ chat: c.id });
        }}
      />
      <NewChat
        open={composing}
        teams={startable}
        user={user}
        onClose={() => setComposing(false)}
        onStarted={async (id) => {
          setComposing(false);
          await refresh();
          setParams({ chat: id });
        }}
      />
    </div>
  );
}

function ChatList({ inbox, activeKey, onOpen, multiTeam }) {
  const { t, locale } = useT();
  return (
    <ul className="m-bleed divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {inbox.map((c) => {
        const key = conversationKey(c);
        const Icon = KIND_ICON[c.kind] || Users;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onOpen(c)}
              aria-current={key === activeKey ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted',
                key === activeKey && 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                  c.kind === 'team' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                )}
                aria-hidden="true"
              >
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-sm text-foreground', c.unread ? 'font-bold' : 'font-semibold')}>
                    {c.title || t('chat.untitled')}
                  </span>
                  {c.lastAt && (
                    <span className="shrink-0 text-xs text-muted-foreground">{shortWhen(c.lastAt, locale)}</span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {c.closed && <Lock size={11} className="shrink-0" aria-label={t('chat.closed')} />}
                  <span className="truncate">
                    {c.lastAt ? `${c.lastAuthor}: ${c.lastBody}` : t('chat.noMessagesYet')}
                  </span>
                </span>
                {multiTeam && c.kind !== 'team' && (
                  <span className="block truncate text-[11px] text-muted-foreground/80">{c.teamName}</span>
                )}
              </span>
              {c.unread > 0 && <CountBadge n={c.unread} label={t('chat.unreadCount', { n: c.unread })} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A nudge for someone whose name is still the start of their email address: the team sees that name on every
 * message, so they're asked once for a real one.
 */
function NamePrompt({ user, teamId }) {
  const { t } = useT();
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    if (!user?.id || !teamId) return undefined;
    chatService.getPeople(teamId).then(
      (people) => live && setMe(people.find((p) => p.userId === user.id) || null),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [user?.id, teamId]);

  const handle = (user?.email || '').split('@')[0].toLowerCase();
  if (done || !me || !handle || me.name.toLowerCase() !== handle) return null;

  return (
    <form
      className="space-y-2 rounded-lg border border-border bg-card p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
          await chatService.setMyName(user.id, name.trim());
          setDone(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="chat-my-name" className="block text-sm font-semibold text-foreground">
        {t('chat.nameTitle')}
      </label>
      <p className="text-xs text-muted-foreground">{t('chat.nameBody', { handle: me.name })}</p>
      <div className="flex gap-2">
        <input
          id="chat-my-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('chat.namePlaceholder')}
          autoComplete="name"
          className={formControl}
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="shrink-0 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

/**
 * For a team admin: the team's private and group chats they aren't in. Opening one is read-only; they can
 * remove a message or close the chat, but only its members post.
 */
function ReviewChats({ open, teams, onClose, onOpen }) {
  const { t, locale } = useT();
  const [teamId, setTeamId] = useState(teams[0]?.teamId || '');
  const [chats, setChats] = useState(null);

  useEffect(() => {
    if (open && !teams.some((x) => x.teamId === teamId)) setTeamId(teams[0]?.teamId || '');
  }, [open, teams, teamId]);

  useEffect(() => {
    let live = true;
    if (!open || !teamId) return undefined;
    setChats(null);
    chatService.getOversight(teamId).then(
      (list) => live && setChats(list),
      () => live && setChats([]),
    );
    return () => {
      live = false;
    };
  }, [open, teamId]);

  return (
    <ResponsiveModal open={open} onClose={onClose} size="md">
      <ResponsiveModal.Header className="border-b border-border">
        <h2 className="text-lg font-bold text-foreground">{t('chat.reviewChats')}</h2>
        <p className="text-sm text-muted-foreground">{t('chat.reviewHelp')}</p>
      </ResponsiveModal.Header>
      <ResponsiveModal.Body className="space-y-3">
        {teams.length > 1 && (
          <label className="block space-y-1 text-sm font-medium text-foreground">
            {t('chat.team')}
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={formControl}>
              {teams.map((x) => (
                <option key={x.teamId} value={x.teamId}>
                  {x.teamName}
                </option>
              ))}
            </select>
          </label>
        )}
        {chats === null ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('chat.reviewNone')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {chats.map((c) => {
              const Icon = KIND_ICON[c.kind] || Users;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(c)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted"
                  >
                    <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{c.title}</span>
                        {c.lastAt && (
                          <span className="shrink-0 text-xs text-muted-foreground">{shortWhen(c.lastAt, locale)}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {c.closed && <Lock size={11} className="shrink-0" aria-label={t('chat.closed')} />}
                        <span className="truncate">
                          {c.lastAt ? `${c.lastAuthor}: ${c.lastBody}` : t('chat.noMessagesYet')}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ResponsiveModal.Body>
    </ResponsiveModal>
  );
}

/** Pick people on a team to talk to: one makes a private chat, more make a group. */
function NewChat({ open, teams, user, onClose, onStarted, addTo = null }) {
  const { t } = useT();
  const [teamId, setTeamId] = useState(teams[0]?.teamId || '');
  const [people, setPeople] = useState([]);
  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const effectiveTeam = addTo?.teamId || teamId;

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setTitle('');
    setQuery('');
    setError('');
    if (!addTo && !teams.some((x) => x.teamId === teamId)) setTeamId(teams[0]?.teamId || '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    if (!open || !effectiveTeam) return undefined;
    chatService.getPeople(effectiveTeam).then(
      (list) =>
        live && setPeople(list.filter((p) => p.userId !== user?.id && !(addTo?.members || []).includes(p.userId))),
      () => live && setPeople([]),
    );
    return () => {
      live = false;
    };
  }, [open, effectiveTeam, user?.id, addTo]);

  const shown = people.filter(
    (p) => !query || `${p.name} ${p.detail}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const submit = async (e) => {
    e.preventDefault();
    if (!picked.length) return;
    setBusy(true);
    setError('');
    try {
      if (addTo) {
        await chatService.addMembers(addTo.id, picked);
        onStarted(addTo.id);
      } else {
        onStarted(await chatService.start(effectiveTeam, picked, picked.length > 1 ? title.trim() : null));
      }
    } catch (err) {
      setError(err?.message || t('chat.startFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} as="form" onSubmit={submit} size="md">
      <ResponsiveModal.Header className="border-b border-border">
        <h2 className="text-lg font-bold text-foreground">{addTo ? t('chat.addPeople') : t('chat.newChat')}</h2>
        {!addTo && <p className="text-sm text-muted-foreground">{t('chat.newChatHelp')}</p>}
      </ResponsiveModal.Header>
      <ResponsiveModal.Body className="space-y-3">
        {!addTo && teams.length > 1 && (
          <label className="block space-y-1 text-sm font-medium text-foreground">
            {t('chat.team')}
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setPicked([]);
              }}
              className={formControl}
            >
              {teams.map((x) => (
                <option key={x.teamId} value={x.teamId}>
                  {x.teamName}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('chat.searchPeople')}
            aria-label={t('chat.searchPeople')}
            className={cn(formControl, 'pl-9')}
          />
        </div>
        <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {shown.map((p) => {
            const on = picked.includes(p.userId);
            return (
              <li key={p.userId}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(p.userId)}
                  className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                >
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                    aria-hidden="true"
                  >
                    {on && <Check size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <span className="truncate">{p.name}</span>
                      {p.role === 'staff' && (
                        <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-bold text-primary">
                          {t('chat.staff')}
                        </span>
                      )}
                    </span>
                    {p.detail && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {t('chat.parentOf', { names: p.detail })}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {!shown.length && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t('chat.noPeople')}</li>
          )}
        </ul>
        {!addTo && picked.length > 1 && (
          <label className="block space-y-1 text-sm font-medium text-foreground">
            {t('chat.groupName')}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder={t('chat.groupNamePlaceholder')}
              className={formControl}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </ResponsiveModal.Body>
      <ResponsiveModal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={busy || !picked.length}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-50"
        >
          {addTo
            ? t('chat.addPeopleButton', { n: picked.length })
            : picked.length > 1
              ? t('chat.startGroup', { n: picked.length + 1 })
              : t('chat.startChat')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}

/** Who's in a private or group chat, and what can be done with it: add people, rename, leave, close. */
function ChatDetails({ open, conv, members, people, user, onClose, onAdd, onChanged, onLeft }) {
  const { t } = useT();
  const [title, setTitle] = useState(conv.title || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameOf = (id) => people.find((p) => p.userId === id)?.name || t('chat.someone');

  useEffect(() => {
    if (open) {
      setTitle(conv.kind === 'group' ? conv.title || '' : '');
      setError('');
    }
  }, [open, conv.kind, conv.title]);

  const run = async (work, after) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await after?.();
    } catch (err) {
      setError(err?.message || t('chat.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} size="md">
      <ResponsiveModal.Header className="border-b border-border">
        <h2 className="text-lg font-bold text-foreground">{t('chat.details')}</h2>
        <p className="text-sm text-muted-foreground">{conv.teamName}</p>
      </ResponsiveModal.Header>
      <ResponsiveModal.Body className="space-y-4">
        {conv.kind === 'group' && !conv.closed && !conv.oversight && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => chatService.rename(conv.id, title.trim()), onChanged);
            }}
          >
            <label htmlFor="chat-rename" className="sr-only">
              {t('chat.groupName')}
            </label>
            <input
              id="chat-rename"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder={t('chat.groupNamePlaceholder')}
              className={formControl}
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
            >
              {t('chat.rename')}
            </button>
          </form>
        )}

        <div>
          <p className="mb-1.5 text-sm font-semibold text-foreground">{t('chat.people', { n: members.length })}</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {members.map((id) => {
              const p = people.find((x) => x.userId === id);
              return (
                <li key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="truncate text-foreground">
                    {nameOf(id)}
                    {id === user?.id && <span className="text-muted-foreground"> ({t('chat.you')})</span>}
                  </span>
                  {p?.role === 'staff' && (
                    <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-bold text-primary">
                      {t('chat.staff')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {conv.kind === 'group' && conv.canStart && !conv.closed && !conv.oversight && (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
            >
              <UsersRound size={14} /> {t('chat.addPeople')}
            </button>
          )}
          {!conv.oversight && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => chatService.leave(conv.id), onLeft)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
            >
              {t('chat.leave')}
            </button>
          )}
          {!conv.closed && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => chatService.close(conv.id), onChanged)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Lock size={14} /> {t('chat.close')}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('chat.closeHelp')}</p>
      </ResponsiveModal.Body>
    </ResponsiveModal>
  );
}

function Thread({ conv, user, multiTeam, onBack, onRead, onLeft }) {
  const { t, locale } = useT();
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [people, setPeople] = useState([]);
  const [members, setMembers] = useState([]);
  const [panel, setPanel] = useState(null); // 'details' | 'add'
  const section = useRef(null);
  const scroller = useRef(null);
  const stickToBottom = useRef(true);
  const isTeam = conv.kind === 'team';
  const keyboard = useKeyboardViewport(section);
  const { muted, toggle: toggleMute } = useNotificationMutes(!conv.oversight);
  const muteKey = isTeam ? muteScope.teamChat(conv.id) : muteScope.thread(conv.id);
  const isMuted = muted.has(muteKey);

  // Names come from the people on the team, so a corrected name shows on old messages too.
  const loadPeople = useCallback(() => {
    chatService.getPeople(conv.teamId).then(setPeople, () => {});
    if (!isTeam) chatService.getMembers(conv.id).then(setMembers, () => {});
  }, [conv.teamId, conv.id, isTeam]);
  useEffect(loadPeople, [loadPeople]);
  const nameOf = useMemo(() => {
    const byId = Object.fromEntries(people.map((p) => [p.userId, p.name]));
    return (m) => byId[m.authorId] || m.authorName || t('chat.someone');
  }, [people, t]);

  const markRead = useCallback(async () => {
    try {
      await chatService.markRead(conv);
      onRead?.();
    } catch {
      // Read state is a convenience; a failure only leaves the badge up.
    }
  }, [conv, onRead]);

  // Merge a message into the list by id (or by client id, for one this phone sent).
  const upsert = useCallback((m) => {
    setMessages((list) => {
      const i = list.findIndex((x) => x.id === m.id || (m.clientId && x.clientId === m.clientId));
      if (i === -1) return [...list, m].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      const next = list.slice();
      next[i] = { ...next[i], ...m, pending: false, failed: false };
      return next;
    });
  }, []);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    chatService.getMessages(conv).then(
      (page) => {
        if (!live) return;
        setMessages(page);
        setHasEarlier(page.length === PAGE_SIZE);
        setStatus('ready');
        markRead();
      },
      () => live && setStatus('error'),
    );
    const filter = isTeam ? `team_id=eq.${conv.id}` : `thread_id=eq.${conv.id}`;
    const channel = supabase
      .channel(`chat-thread-${conversationKey(conv)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages', filter }, (payload) => {
        const row = payload.new;
        // The team chat's stream also carries the team's private chats; those aren't this conversation.
        if (!row?.id || (isTeam && row.thread_id)) return;
        upsert(chatService.toMessage(row));
        if (payload.eventType === 'INSERT' && document.visibilityState === 'visible') markRead();
      })
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [conv.id, conv.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow new messages down, unless the reader has scrolled up to read something older.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  // The same when the list itself gets shorter (a keyboard opening, the composer growing): the newest message
  // stays in view instead of slipping under the box.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onScroll = () => {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadEarlier = async () => {
    const el = scroller.current;
    const before = messages.find((m) => !m.pending)?.createdAt;
    if (!before) return;
    setLoadingEarlier(true);
    const height = el?.scrollHeight || 0;
    try {
      const page = await chatService.getMessages(conv, { before });
      setHasEarlier(page.length === PAGE_SIZE);
      stickToBottom.current = false;
      setMessages((list) => [...page, ...list]);
      // Keep the reader's place: what was at the top stays put as older messages arrive above it.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - height;
      });
    } finally {
      setLoadingEarlier(false);
    }
  };

  const send = async (body, clientId = newClientId()) => {
    stickToBottom.current = true;
    upsert({
      id: `pending-${clientId}`,
      clientId,
      teamId: conv.teamId,
      authorId: user?.id,
      authorName: '',
      body,
      createdAt: new Date().toISOString(),
      pending: true,
    });
    try {
      const saved = await chatService.send(conv, body, clientId);
      setMessages((list) => list.map((m) => (m.clientId === clientId ? { ...saved } : m)));
      // Everyone else in the conversation is notified by the database once the message is saved.
    } catch {
      setMessages((list) => list.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
    }
  };

  const retry = (m) => {
    setMessages((list) => list.filter((x) => x.clientId !== m.clientId));
    send(m.body, m.clientId);
  };

  const days = useMemo(() => groupByDay(messages), [messages]);
  const Icon = KIND_ICON[conv.kind] || Users;
  const subtitle = isTeam
    ? t('chat.teamChat')
    : [t('chat.people', { n: members.length || conv.members || 0 }), multiTeam ? conv.teamName : null]
        .filter(Boolean)
        .join(' · ');

  return (
    <section
      ref={section}
      aria-label={conv.title}
      // While a phone keyboard is up the thread takes exactly the visible strip above it, so its header and the
      // latest messages stay on screen rather than being scrolled off the top to make room for the box.
      style={
        keyboard
          ? {
              position: 'fixed',
              top: keyboard.top,
              left: 0,
              right: 0,
              height: keyboard.height,
              minHeight: 0,
              margin: 0,
              borderRadius: 0,
              zIndex: 1040,
            }
          : undefined
      }
      className="m-bleed flex h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h)-env(safe-area-inset-bottom)-4rem)] min-h-[22rem] flex-col overflow-hidden rounded-lg border border-border bg-card md:h-[calc(100dvh-var(--app-header-h)-9rem)]"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('chat.allChats')}
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted md:hidden"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <Icon size={17} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-foreground">{conv.title || t('chat.untitled')}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {!conv.oversight && (
          <button
            type="button"
            onClick={() => toggleMute(muteKey, !isMuted)}
            aria-label={isMuted ? t('chat.unmute') : t('chat.mute')}
            aria-pressed={isMuted}
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            {isMuted ? <BellOff size={18} /> : <Bell size={18} />}
          </button>
        )}
        {!isTeam && (
          <button
            type="button"
            onClick={() => setPanel('details')}
            aria-label={t('chat.details')}
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <Info size={18} />
          </button>
        )}
      </header>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
        role="log"
        aria-live="polite"
        aria-label={t('chat.messages')}
      >
        {status === 'loading' && (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        )}
        {status === 'error' && <p className="py-8 text-center text-sm text-destructive">{t('chat.loadFailed')}</p>}
        {status === 'ready' && hasEarlier && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={loadEarlier}
              disabled={loadingEarlier}
              className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {loadingEarlier ? t('common.loading') : t('chat.loadEarlier')}
            </button>
          </div>
        )}
        {status === 'ready' && !messages.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {isTeam ? t('chat.startConversation') : conv.oversight ? t('chat.noMessagesYet') : t('chat.startPrivate')}
          </p>
        )}
        {days.map((day) => (
          <div key={day.key} className="space-y-1">
            <p className="my-3 text-center">
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {dayLabel(day.date, locale, t)}
              </span>
            </p>
            {day.messages.map((m, i) => {
              const prev = day.messages[i - 1];
              const firstOfRun =
                !prev ||
                prev.authorId !== m.authorId ||
                new Date(m.createdAt) - new Date(prev.createdAt) > RUN_MS ||
                prev.deletedAt;
              return (
                <Bubble
                  key={m.id}
                  m={m}
                  name={nameOf(m)}
                  mine={m.authorId === user?.id}
                  showName={firstOfRun && (isTeam || conv.kind === 'group' || conv.oversight)}
                  onRetry={() => retry(m)}
                  onChanged={upsert}
                />
              );
            })}
          </div>
        ))}
      </div>

      {conv.closed ? (
        <p className="flex items-center justify-center gap-2 border-t border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          <Lock size={14} aria-hidden="true" /> {t('chat.closedNotice')}
        </p>
      ) : conv.oversight ? (
        <p className="flex items-center justify-center gap-2 border-t border-border bg-muted/50 p-3 text-center text-sm text-muted-foreground">
          <ShieldCheck size={14} className="shrink-0" aria-hidden="true" /> {t('chat.reviewingNotice')}
        </p>
      ) : (
        <Composer onSend={send} placeholder={isTeam ? t('chat.placeholder') : t('chat.placeholderPrivate')} />
      )}

      {!isTeam && (
        <>
          <ChatDetails
            open={panel === 'details'}
            conv={conv}
            members={members}
            people={people}
            user={user}
            onClose={() => setPanel(null)}
            onAdd={() => setPanel('add')}
            onChanged={async () => {
              await onRead?.();
              loadPeople();
              setPanel(null);
            }}
            onLeft={onLeft}
          />
          <NewChat
            open={panel === 'add'}
            teams={[]}
            user={user}
            addTo={{ id: conv.id, teamId: conv.teamId, members }}
            onClose={() => setPanel(null)}
            onStarted={() => {
              loadPeople();
              setPanel(null);
            }}
          />
        </>
      )}
    </section>
  );
}

function Bubble({ m, name, mine, showName, onRetry, onChanged }) {
  const { t, locale } = useT();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [busy, setBusy] = useState(false);
  const time = m.createdAt
    ? new Date(m.createdAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : '';

  const act = async (work) => {
    setBusy(true);
    try {
      onChanged(await work());
      setMenu(false);
      setEditing(false);
    } catch {
      // The menu stays open; the person can try again.
    } finally {
      setBusy(false);
    }
  };

  if (m.deletedAt) {
    return (
      <p className={cn('px-1 py-0.5 text-xs italic text-muted-foreground', mine && 'text-right', showName && 'mt-2')}>
        {t('chat.removed')}
      </p>
    );
  }

  return (
    <div className={cn('group flex flex-col', mine ? 'items-end' : 'items-start', showName && 'mt-2')}>
      {showName && !mine && (
        <span className="mb-0.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
          {name}
          {m.authorRole === 'staff' && (
            <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-bold text-primary">
              {t('chat.staff')}
            </span>
          )}
        </span>
      )}
      <div className={cn('flex min-w-0 max-w-[85%] items-end gap-1', mine && 'flex-row-reverse')}>
        {editing ? (
          <form
            className="flex w-full flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) act(() => chatService.edit(m.id, draft.trim()));
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={2000}
              className="min-w-[14rem] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs font-semibold text-muted-foreground"
              >
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={busy} className="text-xs font-semibold text-primary disabled:opacity-50">
                {t('common.save')}
              </button>
            </span>
          </form>
        ) : (
          <div
            className={cn(
              // `anywhere`, not break-word: only it lets a long link or word shrink the bubble instead of widening it.
              'min-w-0 whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed [overflow-wrap:anywhere]',
              mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground',
              m.pending && 'opacity-60',
            )}
          >
            {m.body}
          </div>
        )}
        {!m.pending && !m.failed && !editing && (
          <MessageMenu
            open={menu}
            setOpen={setMenu}
            canEdit={mine}
            busy={busy}
            onEdit={() => {
              setDraft(m.body);
              setEditing(true);
              setMenu(false);
            }}
            onRemove={() => act(() => chatService.remove(m.id))}
          />
        )}
      </div>
      <span className="mt-0.5 px-1 text-[11px] text-muted-foreground">
        {m.failed ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 font-semibold text-destructive"
          >
            <RotateCw size={11} /> {t('chat.notSentRetry')}
          </button>
        ) : m.pending ? (
          t('chat.sending')
        ) : (
          <>
            {time}
            {m.editedAt && ` · ${t('chat.edited')}`}
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Edit and remove for a message. Who may do what is enforced by the database (your own messages; staff can
 * remove anyone's); the menu offers remove to everyone and the database turns away the rest.
 */
function MessageMenu({ open, setOpen, canEdit, busy, onEdit, onRemove }) {
  const { t } = useT();
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={t('chat.messageActions')}
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-40 hover:bg-muted hover:opacity-100 focus-visible:opacity-100"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <span className="absolute bottom-9 right-0 z-20 flex min-w-[9rem] flex-col rounded-lg border border-border bg-popover py-1 shadow-md">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <Pencil size={14} /> {t('chat.edit')}
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-muted disabled:opacity-50"
          >
            <Trash2 size={14} /> {t('chat.remove')}
          </button>
        </span>
      )}
    </span>
  );
}

function Composer({ onSend, placeholder }) {
  const { t } = useT();
  const [text, setText] = useState('');
  const box = useRef(null);

  // Grows with what's typed, up to about six lines.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    // A scrollbar only once the message outgrows the box; before that the browser would draw an empty track.
    el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden';
  }, [text]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    onSend(body);
    box.current?.focus();
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-border bg-card p-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="chat-compose" className="sr-only">
        {placeholder}
      </label>
      <textarea
        id="chat-compose"
        ref={box}
        rows={1}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // A keyboard sends on Enter (Shift+Enter for a new line); a phone's Return key adds a line.
          if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover: hover)').matches) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-base text-foreground outline-none focus:ring-2 focus:ring-ring md:text-sm"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label={t('chat.send')}
        // Keeps focus (and the phone keyboard) in the box: a tap that moved focus here would drop the keyboard
        // and bring it straight back as the box is refocused.
        onPointerDown={(e) => e.preventDefault()}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
      >
        <Send size={18} />
      </button>
    </form>
  );
}

/**
 * The visible strip of the screen while someone types inside `container` with a phone keyboard up, or null
 * otherwise. Phone browsers keep the page its full height under the keyboard and scroll it to reveal the focused
 * box, which pushes everything above the box off the top; the visual viewport is what's actually showing.
 */
function useKeyboardViewport(container) {
  const [box, setBox] = useState(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    // Measured against the tallest the viewport has been at this width, so an Android WebView that resizes the
    // whole page for the keyboard reads the same as a browser that only shrinks the visual viewport.
    let width = vv.width;
    let tallest = vv.height;
    let frame = 0;
    const measure = () => {
      if (vv.width !== width) {
        width = vv.width;
        tallest = vv.height;
      }
      tallest = Math.max(tallest, vv.height);
      const el = document.activeElement;
      const typing = el && container.current?.contains(el) && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
      const open = typing && vv.height < tallest - 120;
      setBox((prev) => {
        if (!open) return null;
        if (prev && prev.top === vv.offsetTop && prev.height === vv.height) return prev;
        return { top: vv.offsetTop, height: vv.height };
      });
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [container]);

  return box;
}

function groupByDay(messages) {
  const days = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, date: d, messages: [] };
      days.push(day);
    }
    day.messages.push(m);
  }
  return days;
}

function dayLabel(date, locale, t) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(date, today)) return t('chat.today');
  if (same(date, yesterday)) return t('chat.yesterday');
  return date.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

function shortWhen(iso, locale) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
