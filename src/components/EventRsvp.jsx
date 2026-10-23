import { useState } from 'react';
import { Check, ChevronDown, HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '../i18n/I18nContext';

const STATUSES = [
  { id: 'going', icon: Check, on: 'border-success bg-success text-success-foreground' },
  { id: 'maybe', icon: HelpCircle, on: 'border-warning bg-warning text-warning-foreground' },
  { id: 'no', icon: X, on: 'border-destructive bg-destructive text-destructive-foreground' },
];

const nameOf = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim();

/** Going / Maybe / Can't go for one player: tapping the current answer again clears it. */
function Answer({ player, status, onChange, busy, compact = false }) {
  const { t } = useT();
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={t('schedule.rsvp.forPlayer', { name: nameOf(player) })}
    >
      {STATUSES.map(({ id, icon: Icon, on }) => {
        const active = status === id;
        return (
          <button
            key={id}
            type="button"
            disabled={busy}
            aria-pressed={active}
            aria-label={compact ? t(`schedule.rsvp.${id}`) : undefined}
            title={compact ? t(`schedule.rsvp.${id}`) : undefined}
            onClick={() => onChange(active ? null : id)}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full border text-sm font-semibold transition-colors disabled:opacity-60',
              compact ? 'min-w-10 justify-center px-0' : 'px-3',
              active ? on : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={compact ? 16 : 14} aria-hidden="true" />
            {!compact && t(`schedule.rsvp.${id}`)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Who's coming to an event. A guardian answers for each of their children on the team; staff see the
 * headcount, who hasn't answered, and can answer for anyone (a parent who replied by text).
 *
 * rsvps: [{ playerId, status }] for this event · roster: the team's players (staff) · mine: the viewer's own
 * children on this team · onChange(playerId, status | null)
 */
export default function EventRsvp({ rsvps = [], roster = [], mine = [], canManage = false, onChange }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const byPlayer = Object.fromEntries(rsvps.map((r) => [r.playerId, r.status]));

  const set = async (playerId, status) => {
    setBusy(playerId);
    try {
      await onChange(playerId, status);
    } finally {
      setBusy(null);
    }
  };

  const counts = { going: 0, maybe: 0, no: 0 };
  const people = canManage ? roster : [];
  // Staff count against the roster; anyone else against the answers they can see.
  const tally = canManage ? roster.map((p) => byPlayer[p.id]).filter(Boolean) : rsvps.map((r) => r.status);
  tally.forEach((s) => counts[s] !== undefined && counts[s]++);
  const noReply = canManage ? roster.length - tally.length : null;

  return (
    <div className="mt-3 space-y-2">
      {mine.map((p) => (
        <div key={p.id} className="space-y-1.5">
          {(mine.length > 1 || canManage) && <p className="text-xs font-semibold text-muted-foreground">{nameOf(p)}</p>}
          <Answer player={p} status={byPlayer[p.id]} busy={busy === p.id} onChange={(s) => set(p.id, s)} />
        </div>
      ))}

      <button
        type="button"
        onClick={() => canManage && setOpen((o) => !o)}
        aria-expanded={canManage ? open : undefined}
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground',
          canManage ? 'min-h-10 hover:text-foreground' : 'cursor-default',
        )}
      >
        <span className="font-semibold text-success">{t('schedule.rsvp.countGoing', { n: counts.going })}</span>
        <span>{t('schedule.rsvp.countMaybe', { n: counts.maybe })}</span>
        <span>{t('schedule.rsvp.countNo', { n: counts.no })}</span>
        {noReply !== null && <span>{t('schedule.rsvp.countNoReply', { n: noReply })}</span>}
        {canManage && (
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
        )}
      </button>

      {canManage && open && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {[...people]
            .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
            .map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm font-medium text-foreground">{nameOf(p)}</span>
                {/* Icons only in the list, so a whole roster stays one line a player. */}
                <Answer
                  player={p}
                  status={byPlayer[p.id]}
                  busy={busy === p.id}
                  onChange={(s) => set(p.id, s)}
                  compact
                />
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
