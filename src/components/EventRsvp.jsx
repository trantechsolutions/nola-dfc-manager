import { useState } from 'react';
import { Check, ChevronDown, HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '../i18n/I18nContext';

// Check, question mark, cross: green, orange, red. Unanswered they're outlined in their colour so the meaning
// reads before anyone taps; the current answer is filled.
const STATUSES = [
  {
    id: 'going',
    icon: Check,
    idle: 'border-success/40 text-success hover:bg-success/10',
    on: 'border-success bg-success text-success-foreground',
    text: 'text-success',
  },
  {
    id: 'maybe',
    icon: HelpCircle,
    idle: 'border-[#e8590c]/40 text-[#e8590c] hover:bg-[#e8590c]/10 dark:border-[#ff922b]/40 dark:text-[#ff922b]',
    on: 'border-[#e8590c] bg-[#e8590c] text-white dark:border-[#ff922b] dark:bg-[#ff922b] dark:text-black',
    text: 'text-[#e8590c] dark:text-[#ff922b]',
  },
  {
    id: 'no',
    icon: X,
    idle: 'border-destructive/40 text-destructive hover:bg-destructive/10',
    on: 'border-destructive bg-destructive text-destructive-foreground',
    text: 'text-destructive',
  },
];

export const RSVP_STATUSES = STATUSES;

const COUNT_KEYS = {
  going: 'schedule.rsvp.countGoing',
  maybe: 'schedule.rsvp.countMaybe',
  no: 'schedule.rsvp.countNo',
};

const nameOf = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim();

/** Going / Maybe / Can't go for one player, as three icons: tapping the current answer again clears it. */
function Answer({ player, status, onChange, busy, readOnly = false, small = false }) {
  const { t } = useT();
  return (
    <div
      className={cn('flex items-center', small ? 'gap-1.5' : 'gap-2')}
      role="group"
      aria-label={t('schedule.rsvp.forPlayer', { name: nameOf(player) })}
    >
      {STATUSES.map(({ id, icon: Icon, idle, on }) => {
        const active = status === id;
        return (
          <button
            key={id}
            type="button"
            disabled={busy || readOnly}
            aria-pressed={active}
            aria-label={t(`schedule.rsvp.${id}`)}
            title={t(`schedule.rsvp.${id}`)}
            onClick={() => onChange(active ? null : id)}
            className={cn(
              'grid place-items-center rounded-full border-2 transition-colors',
              small ? 'h-8 w-8' : 'h-10 w-10',
              active ? on : cn('bg-card', idle),
              // A past or cancelled event shows its answer; the others fade.
              readOnly ? (active ? 'cursor-default' : 'cursor-default opacity-35') : 'disabled:opacity-60',
            )}
          >
            <Icon size={small ? 15 : 18} strokeWidth={2.5} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** The optional reason under a "can't go", saved when the field is left or Enter is pressed. */
function DeclineNote({ note, onSave, readOnly }) {
  const { t } = useT();
  const [value, setValue] = useState(note || '');
  if (readOnly) {
    return note ? <p className="text-sm italic text-muted-foreground">{note}</p> : null;
  }
  const save = () => {
    if (value.trim() !== (note || '')) onSave(value.trim());
  };
  return (
    <input
      type="text"
      value={value}
      maxLength={200}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder={t('schedule.rsvp.notePlaceholder')}
      aria-label={t('schedule.rsvp.notePlaceholder')}
      className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

/**
 * Who's coming to an event. A guardian answers for each of their children on the team; staff see the
 * headcount, who hasn't answered, and can answer for anyone (a parent who replied by text). A "can't go" can
 * carry an optional note.
 *
 * rsvps: [{ playerId, status, note }] for this event · roster: the team's players (staff) · mine: the viewer's
 * own children on this team (or themselves) · onChange(playerId, status | null, note?) · readOnly: a past or
 * cancelled event · compact: smaller, for lists and the calendar
 */
export default function EventRsvp({
  rsvps = [],
  roster = [],
  mine = [],
  canManage = false,
  onChange,
  readOnly = false,
  compact = false,
  className = 'mt-3',
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const byPlayer = Object.fromEntries(rsvps.map((r) => [r.playerId, r]));

  const set = async (playerId, status, note = null) => {
    setBusy(playerId);
    try {
      await onChange(playerId, status, note);
    } finally {
      setBusy(null);
    }
  };

  const counts = { going: 0, maybe: 0, no: 0 };
  const people = canManage ? roster : [];
  // Staff count against the roster; anyone else against the answers they can see.
  const tally = canManage ? roster.map((p) => byPlayer[p.id]?.status).filter(Boolean) : rsvps.map((r) => r.status);
  tally.forEach((s) => counts[s] !== undefined && counts[s]++);
  const noReply = canManage ? roster.length - tally.length : null;
  const expandable = canManage && !compact;

  return (
    <div className={cn('space-y-2', className)}>
      {/* A guardian answers on behalf of each of their players, so each row says whose answer it is; a player
          signed in as themselves just answers. */}
      {mine.map((p) => {
        const answer = byPlayer[p.id];
        return (
          <div key={p.id} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Answer
                player={p}
                status={answer?.status}
                busy={busy === p.id}
                readOnly={readOnly}
                small={compact}
                onChange={(s) => set(p.id, s)}
              />
              {!p.isSelf && (
                <span className="text-sm font-semibold text-muted-foreground">
                  {t('schedule.rsvp.answerFor', { name: p.firstName || nameOf(p) })}
                </span>
              )}
            </div>
            {answer?.status === 'no' && (
              <DeclineNote
                key={`${p.id}-${answer.note || ''}`}
                note={answer.note}
                readOnly={readOnly}
                onSave={(note) => set(p.id, 'no', note)}
              />
            )}
          </div>
        );
      })}

      {(canManage || !compact) && (
        <button
          type="button"
          onClick={() => expandable && setOpen((o) => !o)}
          aria-expanded={expandable ? open : undefined}
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground',
            expandable ? 'min-h-10 hover:text-foreground' : 'cursor-default',
          )}
        >
          {STATUSES.map(({ id, icon: Icon, text }) => (
            <span key={id} className={cn('inline-flex items-center gap-1 font-semibold', text)}>
              <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
              <span className="tabular-nums" aria-hidden="true">
                {counts[id]}
              </span>
              <span className="sr-only">{t(COUNT_KEYS[id], { n: counts[id] })}</span>
            </span>
          ))}
          {noReply !== null && <span>{t('schedule.rsvp.countNoReply', { n: noReply })}</span>}
          {expandable && (
            <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
          )}
        </button>
      )}

      {expandable && open && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {[...people]
            .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
            .map((p) => {
              const answer = byPlayer[p.id];
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{nameOf(p)}</span>
                    {answer?.status === 'no' && answer.note && (
                      <span className="block text-xs italic text-muted-foreground">{answer.note}</span>
                    )}
                  </span>
                  <Answer
                    player={p}
                    status={answer?.status}
                    busy={busy === p.id}
                    readOnly={readOnly}
                    onChange={(s) => set(p.id, s)}
                  />
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
