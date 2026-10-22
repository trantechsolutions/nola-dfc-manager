import { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  CalendarDays,
  History,
  AlertCircle,
  Search,
  Filter,
  Clock,
  MapPin,
  X,
  RefreshCw,
  Lock,
  DollarSign,
  CheckCircle2,
  Layers,
  FileText,
  PlayCircle,
  CalendarPlus,
  Pencil,
} from 'lucide-react';
import { filmService, filmGameLink } from '../../services/filmService';
import CalendarView from '../../components/CalendarView';
import EventExpenseModal from '../../components/EventExpenseModal';
import BulkExpenseModal from '../../components/BulkExpenseModal';
import PanelHost from '../../components/layout/PanelHost';
import PageTabs from '../../components/layout/PageTabs';
import { usePanelRoute } from '../../hooks/usePanelRoute';
import { EVENT_TYPES } from '../../utils/eventClassifier';
import { useT } from '../../i18n/I18nContext';
import { downloadEventIcs, subscribeUrl } from '../../utils/ics';
import { filterEventsBySeason, getSeasonForDate } from '../../utils/seasonUtils';
import { PANELS } from '../../utils/panelRoute';
import { buildInstallmentIndex, isInstallment, planProgress } from '../../utils/installments';

// ── Event row ────────────────────────────────────────────────
// One line of a month: the date set large on the left (the same block the
// Home card and its "after that" list use, so the eye learns it once), then
// what, when and where. Staff tools — the event type, expenses, game film —
// hang underneath rather than competing with the time and place.
const EventRow = ({
  event,
  isPast = false,
  isNext = false,
  dbEvent = null,
  onTypeChange = null,
  onScoreChange = null,
  teamName = '',
  expenseSummary = null,
  onManageExpenses = null,
  film = null,
}) => {
  const { t, locale } = useT();
  const isGame = GAME_TYPES.includes(dbEvent?.eventType || event.eventType);
  const [editing, setEditing] = useState(false);
  const effectiveType = dbEvent?.eventType || event.eventType;
  const type = EVENT_TYPES[effectiveType] || EVENT_TYPES.event;
  const typeLabel = t(`eventTypes.${effectiveType}`, type.label);
  const canEdit = onTypeChange && dbEvent;
  const date = new Date(event.timestamp * 1000);

  const handleTypeSelect = async (e) => {
    const newType = e.target.value;
    setEditing(false);
    if (newType !== effectiveType) await onTypeChange(dbEvent.id, newType);
  };

  return (
    <li className={`relative flex gap-4 px-4 py-4 ${event.isCancelled ? 'opacity-50' : ''}`}>
      {isNext && (
        <span
          className="absolute inset-y-3 left-0 w-1 rounded-r-full"
          style={{ backgroundColor: 'var(--team-edge)' }}
          aria-hidden="true"
        />
      )}
      <span className="w-12 shrink-0 text-center">
        <span className="block text-xs text-muted-foreground">
          {date.toLocaleDateString(locale, { weekday: 'short' })}
        </span>
        <span
          className={`block font-numeral text-3xl font-bold leading-tight tabular-nums ${
            isPast ? 'text-muted-foreground' : 'text-foreground'
          }`}
        >
          {date.getDate()}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h4
            className={`text-base font-semibold leading-snug text-foreground ${event.isCancelled ? 'line-through' : ''}`}
          >
            {event.title}
          </h4>
          {isPast && isGame && <ScoreChip scoreFor={dbEvent?.scoreFor} scoreAgainst={dbEvent?.scoreAgainst} />}
          {isNext && (
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {t('nav.nextUp')}
            </span>
          )}
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5 tabular-nums">
            <Clock size={14} className="shrink-0" aria-hidden="true" />
            {event.displayTime}
          </span>
          <span className="flex min-w-0 items-center gap-1.5" title={event.location}>
            <MapPin size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{event.location}</span>
          </span>
          {canEdit && editing ? (
            <select
              autoFocus
              onBlur={() => setEditing(false)}
              onChange={handleTypeSelect}
              defaultValue={effectiveType}
              className="rounded-md border border-border bg-card px-2 py-0.5 text-sm outline-none"
            >
              {Object.keys(EVENT_TYPES).map((key) => (
                <option key={key} value={key}>
                  {t(`eventTypes.${key}`, EVENT_TYPES[key].label)}
                </option>
              ))}
            </select>
          ) : !canEdit ? (
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${type.dot}`} aria-hidden="true" />
              {typeLabel}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`-my-2 flex items-center gap-1.5 rounded-md py-2 ${canEdit ? 'hover:text-foreground' : 'cursor-default'}`}
              title={canEdit ? t('schedule.clickToChangeType') : undefined}
            >
              <span className={`h-2 w-2 rounded-full ${type.dot}`} aria-hidden="true" />
              {typeLabel}
              {dbEvent?.typeLocked && <Lock size={11} className="opacity-60" aria-label="Locked" />}
            </button>
          )}
        </p>

        {!isPast && (
          <button type="button" onClick={() => downloadEventIcs(event, { teamName })} className={ROW_ACTION}>
            <CalendarPlus size={14} aria-hidden="true" />
            {t('nav.addToCalendar')}
          </button>
        )}

        {isPast && isGame && dbEvent && onScoreChange && (
          <ScoreEditor dbEvent={dbEvent} onScoreChange={onScoreChange} />
        )}

        {/* This game's breakdowns on the game film site */}
        {film?.games?.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {film.games.map((g) => (
              <div key={g.slug} className="flex flex-wrap items-center gap-2">
                {film.games.length > 1 && (
                  <span className="mr-1 text-xs font-semibold text-muted-foreground">{gameLabel(g.slug)}</span>
                )}
                <FilmButton href={filmGameLink(film.access, g.slug, 'report')} icon={<FileText size={13} />}>
                  {t('schedule.filmReport')}
                </FilmButton>
                {g.hasHighlights && (
                  <FilmButton href={filmGameLink(film.access, g.slug, 'highlights')} icon={<PlayCircle size={13} />}>
                    {t('schedule.filmHighlights')}
                  </FilmButton>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Expenses — only for synced events, and only for staff who can edit */}
        {dbEvent && onManageExpenses && (
          <button type="button" onClick={() => onManageExpenses(dbEvent)} className={ROW_ACTION}>
            <DollarSign size={12} aria-hidden="true" />
            {expenseSummary && expenseSummary.total > 0 ? (
              <>
                <span>
                  {expenseSummary.paid}/{expenseSummary.count} {t('schedule.paid').toLowerCase()}
                </span>
                {expenseSummary.remaining > 0 ? (
                  <span className="text-amber-700 dark:text-amber-300">
                    ${expenseSummary.remaining.toFixed(2)} {t('schedule.due')}
                  </span>
                ) : (
                  <CheckCircle2 size={12} className="text-success" aria-label={t('schedule.paid')} />
                )}
              </>
            ) : (
              t('schedule.manageExpenses')
            )}
          </button>
        )}
      </div>
    </li>
  );
};

/** Events grouped under a heading per month, in the order given. */
const MonthGroups = ({ events, locale, renderRow }) => {
  const groups = [];
  events.forEach((event) => {
    const date = new Date(event.timestamp * 1000);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
        events: [],
      };
      groups.push(group);
    }
    group.events.push(event);
  });

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          {/* Stays under the header while its month scrolls past, so a long
              season never leaves you wondering which month a date is in. */}
          <h3 className="sticky-below-tabs -mx-1 mb-2 bg-canvas px-2 py-2 text-sm font-semibold text-muted-foreground">
            {group.label}
          </h3>
          <ul className="m-bleed divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {group.events.map(renderRow)}
          </ul>
        </section>
      ))}
    </div>
  );
};

// Row actions under an event: 40px tall so each is a comfortable tap on a
// phone, and spaced so a thumb cannot catch the neighbour.
const ROW_ACTION =
  'mr-2 mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

// Events that end in a result worth recording.
const GAME_TYPES = ['league', 'friendly', 'tournament'];

/** "W 3–1" beside a past game, once its result is in. */
const ScoreChip = ({ scoreFor, scoreAgainst }) => {
  const { t } = useT();
  if (scoreFor == null || scoreAgainst == null) return null;
  const outcome = scoreFor > scoreAgainst ? 'Win' : scoreFor < scoreAgainst ? 'Loss' : 'Draw';
  const tone =
    outcome === 'Win'
      ? 'bg-success text-success-foreground'
      : outcome === 'Loss'
        ? 'bg-foreground text-background'
        : 'bg-muted text-foreground';
  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      aria-label={`${t(`nav.score${outcome}Long`)} ${scoreFor}–${scoreAgainst}`}
    >
      <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${tone}`} aria-hidden="true">
        {t(`nav.score${outcome}`)}
      </span>
      <span className="font-numeral text-xl font-bold leading-none tabular-nums text-foreground" aria-hidden="true">
        {scoreFor}–{scoreAgainst}
      </span>
    </span>
  );
};

/** Staff enter or correct a past game's result in place; blank both to clear it. */
const ScoreEditor = ({ dbEvent, onScoreChange }) => {
  const { t } = useT();
  const hasScore = dbEvent.scoreFor != null && dbEvent.scoreAgainst != null;
  const [open, setOpen] = useState(false);
  const [us, setUs] = useState('');
  const [them, setThem] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const start = () => {
    setUs(hasScore ? String(dbEvent.scoreFor) : '');
    setThem(hasScore ? String(dbEvent.scoreAgainst) : '');
    setError(false);
    setOpen(true);
  };

  const save = async (scoreFor, scoreAgainst) => {
    setSaving(true);
    setError(false);
    try {
      await onScoreChange(dbEvent.id, scoreFor, scoreAgainst);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const parse = (v) => (v === '' ? null : Math.max(0, Math.min(99, parseInt(v, 10) || 0)));
  const ready = us !== '' && them !== '';

  if (!open) {
    return (
      <button type="button" onClick={start} className={ROW_ACTION}>
        <Pencil size={12} aria-hidden="true" />
        {hasScore ? t('nav.editScore') : t('nav.addScore')}
      </button>
    );
  }

  const field = (label, value, setValue) => (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min="0"
        max="99"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-14 rounded-md border border-input bg-card px-2 py-1 text-center font-numeral text-lg font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );

  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) save(parse(us), parse(them));
      }}
    >
      {field(t('nav.scoreUs'), us, setUs)}
      {field(t('nav.scoreThem'), them, setThem)}
      <button
        type="submit"
        disabled={!ready || saving}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {t('nav.saveScore')}
      </button>
      {hasScore && (
        <button
          type="button"
          disabled={saving}
          onClick={() => save(null, null)}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {t('nav.clearScore')}
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        {t('common.cancel')}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {t('nav.scoreSaveFailed')}
        </p>
      )}
    </form>
  );
};

// A tournament's games share its schedule entry; tell them apart by the opponent in the film's address.
const gameLabel = (slug) =>
  slug
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const FilmButton = ({ href, icon, children }) =>
  href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-border bg-card text-foreground hover:bg-background transition-colors"
    >
      {icon}
      {children}
    </a>
  ) : null;

// The team's breakdowns on the game film site, by schedule entry, with the keys that open them.
function useFilmGames(teamId) {
  const [film, setFilm] = useState({ access: null, byEvent: {} });
  useEffect(() => {
    let live = true;
    Promise.all([filmService.getAccess(teamId), filmService.getGames(teamId)]).then(
      ([access, games]) => {
        if (!live) return;
        const byEvent = {};
        for (const g of access ? games : []) if (g.eventId) (byEvent[g.eventId] ||= []).push(g);
        setFilm({ access, byEvent });
      },
      () => live && setFilm({ access: null, byEvent: {} }),
    );
    return () => {
      live = false;
    };
  }, [teamId]);
  return film;
}

// ── Main ──────────────────────────────────────────────────────
export default function ScheduleView({
  events,
  blackoutDates,
  onToggleBlackout,
  selectedTeam,
  canEditSchedule,
  onSyncCalendar,
  teamEvents = [],
  onTypeChange = null,
  onScoreChange = null,
  transactions = [],
  onSaveExpense = null,
  onToggleCleared = null,
  onDeleteExpense = null,
  onBulkAddExpenses = null,
  seasonIds = [],
  selectedSeason,
  activeAccounts = [],
  accountMap = {},
  onPushEventToBudget = null,
  budgetContributions = [],
  budgetLocked = false,
  budgetRecalculatesFee = true,
}) {
  const { t, locale } = useT();
  const [tab, setTab] = useState('upcoming');
  const [isSyncing, setIsSyncing] = useState(false);
  const { panel, panelParams, openPanel, closePanel } = usePanelRoute();
  const showBulkExpenses = panel === PANELS.BULK_EXPENSES;
  // The event whose expenses are open is named by the URL, so the panel comes
  // back on a reload instead of dropping the user on the bare schedule.
  const expenseModalEvent =
    panel === PANELS.EVENT_EXPENSE && panelParams.id
      ? teamEvents.find((e) => String(e.id) === panelParams.id) || null
      : null;

  const film = useFilmGames(selectedTeam?.id);
  const filmFor = (db) => (db && film.byEvent[db.id] ? { access: film.access, games: film.byEvent[db.id] } : null);

  // Map iCal event → DB event so EventCards can show/edit the locked type.
  // Matched by UID, then by start time: after a feed URL change the synced row
  // keeps the original feed's UID while the live feed carries the new one.
  const findDbEvent = useMemo(() => {
    const byUid = {};
    const byTime = {};
    teamEvents.forEach((e) => {
      byUid[e.uid] = e;
      const t = Math.floor(new Date(e.eventDate).getTime() / 1000);
      if (!(t in byTime)) byTime[t] = e;
    });
    return (e) => byUid[e.id] || byTime[e.timestamp] || null;
  }, [teamEvents]);

  // Map DB event ID → linked transactions for expense tracking
  const txByEventId = useMemo(() => {
    const map = {};
    transactions.forEach((tx) => {
      if (tx.eventId) {
        if (!map[tx.eventId]) map[tx.eventId] = [];
        map[tx.eventId].push(tx);
      }
    });
    return map;
  }, [transactions]);

  // Compute expense summary per DB event
  const getExpenseSummary = (dbEvent) => {
    if (!dbEvent) return null;
    const linked = txByEventId[dbEvent.id] || [];
    if (linked.length === 0) return { count: 0, total: 0, paid: 0, remaining: 0 };
    const expenses = linked.filter((tx) => tx.category !== 'TRF');
    const installmentIndex = buildInstallmentIndex(expenses);
    // A partial payment is folded into the cost it pays off — that cost already
    // carries the full figure, so counting the payments as line items of their
    // own would bill the event twice.
    const items = expenses.filter((tx) => !isInstallment(tx));
    const total = items.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    // What has actually been settled, from either direction: an expense that
    // cleared outright, or the payments made against one being paid off. A cost
    // on a plan is never cleared itself, so the two can't overlap.
    const paidTotal = expenses.filter((tx) => tx.cleared).reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const paidItems = items.filter((tx) => tx.cleared || planProgress(tx, installmentIndex).complete);
    return { count: items.length, total, paid: paidItems.length, remaining: total - paidTotal };
  };

  // Filter events to selected season
  const seasonEvents = useMemo(() => {
    if (!selectedSeason) return events;
    return filterEventsBySeason(events, selectedSeason);
  }, [events, selectedSeason]);

  // Only events synced into the DB can carry an expense (a transaction keys off
  // the team_events row), so the bulk picker is built from those alone.
  const bulkCandidates = useMemo(() => {
    const build = (list, isPast) =>
      list
        .map((e) => ({ e, db: findDbEvent(e) }))
        .filter(({ db }) => !!db)
        .map(({ e, db }) => ({
          id: db.id,
          title: e.title,
          displayDate: e.displayDate,
          eventDate: db.eventDate,
          eventType: db.eventType || e.eventType,
          isPast,
        }));
    return [...build(seasonEvents.upcoming, false), ...build(seasonEvents.past, true)];
  }, [seasonEvents, findDbEvent]);

  const handleSync = async () => {
    if (!onSyncCalendar) return;
    setIsSyncing(true);
    try {
      await onSyncCalendar();
    } finally {
      setIsSyncing(false);
    }
  };
  const [typeFilters, setTypeFilters] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const currentIcsUrl = selectedTeam?.icalUrl || '';

  const ALL_TABS = [
    { id: 'upcoming', label: t('schedule.upcoming'), icon: Calendar },
    { id: 'past', label: t('schedule.past'), icon: History },
    { id: 'calendar', label: t('schedule.calendar'), icon: CalendarDays },
  ];

  const toggleTypeFilter = (key) => {
    setTypeFilters((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const applyFilters = (list) => {
    let result = list;
    if (typeFilters.length > 0) result = result.filter((e) => typeFilters.includes(e.eventType));
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q),
      );
    }
    return result;
  };

  const filteredUpcoming = useMemo(
    () => applyFilters(seasonEvents.upcoming),
    [seasonEvents.upcoming, typeFilters, searchTerm],
  );
  const filteredPast = useMemo(() => applyFilters(seasonEvents.past), [seasonEvents.past, typeFilters, searchTerm]);
  const hasFilters = typeFilters.length > 0 || searchTerm;

  // Search and type filters sit inline above the list rather than in a box of
  // their own: they refine the list, they are not a destination.
  const FilterBar = () => (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <input
          type="search"
          placeholder={t('schedule.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={t('common.reset')}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {Object.entries(EVENT_TYPES).map(([key, type]) => {
          const on = typeFilters.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleTypeFilter(key)}
              aria-pressed={on}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${type.dot}`} aria-hidden="true" />
              {t(`eventTypes.${key}`, type.label)}
            </button>
          );
        })}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setTypeFilters([]);
              setSearchTerm('');
            }}
            className="flex shrink-0 items-center gap-1 px-2 text-sm font-semibold text-primary"
          >
            <X size={14} /> {t('common.reset')}
          </button>
        )}
      </div>
    </div>
  );

  const renderRow = (isPast) => (e, index) => {
    const db = findDbEvent(e);
    return (
      <EventRow
        key={e.id}
        event={e}
        isPast={isPast}
        isNext={!isPast && !hasFilters && index === 0 && e.id === seasonEvents.upcoming[0]?.id}
        dbEvent={db}
        onTypeChange={onTypeChange}
        onScoreChange={onScoreChange}
        teamName={selectedTeam?.name}
        expenseSummary={getExpenseSummary(db)}
        film={filmFor(db)}
        onManageExpenses={canEditSchedule ? (event) => openPanel(PANELS.EVENT_EXPENSE, { id: event.id }) : null}
      />
    );
  };

  const EmptyList = ({ children }) => (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── Staff and calendar actions ── (page title comes from the shell) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {onBulkAddExpenses && bulkCandidates.length > 0 && (
            <button
              type="button"
              onClick={() => openPanel(PANELS.BULK_EXPENSES)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Layers size={14} />
              {t('bulkExpenses.open')}
            </button>
          )}
          {canEditSchedule && currentIcsUrl && (
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? t('schedule.syncing') : t('schedule.sync')}
            </button>
          )}
          {subscribeUrl(currentIcsUrl) && (
            <a
              href={subscribeUrl(currentIcsUrl)}
              title={t('nav.subscribeHint')}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <CalendarPlus size={14} aria-hidden="true" />
              {t('nav.subscribe')}
            </a>
          )}
          {currentIcsUrl && !canEditSchedule && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              {t('schedule.live')}
            </span>
          )}
        </div>
      </div>

      {/* ── View switch ── pinned under the header while the list scrolls */}
      <PageTabs
        tabs={ALL_TABS.map((tb) => ({
          id: tb.id,
          label: tb.label,
          count:
            tb.id === 'upcoming' ? seasonEvents.upcoming.length : tb.id === 'past' ? seasonEvents.past.length : null,
        }))}
        active={tab}
        onChange={setTab}
      />

      {/* ── No feed warning (non-admins only) ── */}
      {!currentIcsUrl && !canEditSchedule && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30">
          <AlertCircle size={18} className="shrink-0 text-amber-700 dark:text-amber-400" />
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('schedule.noFeed')}</p>
        </div>
      )}

      {/* ── Upcoming ── */}
      {tab === 'upcoming' && (
        <>
          <FilterBar />
          {filteredUpcoming.length === 0 ? (
            <EmptyList>{hasFilters ? t('schedule.noFilterMatch') : t('schedule.noUpcoming')}</EmptyList>
          ) : (
            <MonthGroups events={filteredUpcoming} locale={locale} renderRow={renderRow(false)} />
          )}
        </>
      )}

      {/* ── Past ── newest first, so last weekend is at the top */}
      {tab === 'past' && (
        <>
          <FilterBar />
          {filteredPast.length === 0 ? (
            <EmptyList>{hasFilters ? t('schedule.noFilterMatch') : t('schedule.noPast')}</EmptyList>
          ) : (
            <MonthGroups events={filteredPast} locale={locale} renderRow={renderRow(true)} />
          )}
        </>
      )}

      {/* ── Calendar ── */}
      {/* CalendarView now owns its own two-column layout and inner scroll —
          no outer min-width wrapper, which would defeat the left rail. */}
      {tab === 'calendar' && (
        <CalendarView events={events} blackoutDates={blackoutDates} onToggleBlackout={onToggleBlackout} />
      )}

      {/* ═══ PANELS ═══ opened and closed by the URL (usePanelRoute) */}
      <PanelHost>
        <EventExpenseModal
          show={!!expenseModalEvent}
          onClose={closePanel}
          dbEvent={expenseModalEvent}
          linkedTransactions={expenseModalEvent ? txByEventId[expenseModalEvent.id] || [] : []}
          onSaveExpense={onSaveExpense}
          onToggleCleared={onToggleCleared}
          onDeleteExpense={onDeleteExpense}
          seasonIds={seasonIds}
          activeAccounts={activeAccounts}
          accountMap={accountMap}
          onPushToBudget={
            onPushEventToBudget && expenseModalEvent
              ? () => onPushEventToBudget(expenseModalEvent, txByEventId[expenseModalEvent.id] || [])
              : null
          }
          budgetContributions={
            expenseModalEvent ? budgetContributions.filter((c) => c.eventId === expenseModalEvent.id) : []
          }
          budgetLocked={budgetLocked}
          budgetRecalculatesFee={budgetRecalculatesFee}
          // An event outside the selected season has no budget of its own to move,
          // and pushing it would silently spend another season's money.
          budgetAvailable={
            !!expenseModalEvent &&
            getSeasonForDate(expenseModalEvent.eventDate?.split('T')[0], [selectedSeason]) !== null
          }
        />

        {/* ── Bulk Expense Modal ── */}
        <BulkExpenseModal
          show={showBulkExpenses}
          onClose={closePanel}
          candidates={bulkCandidates}
          existingByEventId={txByEventId}
          onBulkAddExpenses={onBulkAddExpenses}
          seasonIds={seasonIds}
          activeAccounts={activeAccounts}
        />
      </PanelHost>
    </div>
  );
}
