import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import CalendarView from '../../components/CalendarView';
import EventExpenseModal from '../../components/EventExpenseModal';
import { EVENT_TYPES } from '../../utils/eventClassifier';
import { useT } from '../../i18n/I18nContext';
import { filterEventsBySeason } from '../../utils/seasonUtils';

// ── Event card ────────────────────────────────────────────────
const EventCard = ({
  event,
  isPast = false,
  dbEvent = null,
  onTypeChange = null,
  expenseSummary = null,
  onManageExpenses = null,
}) => {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const effectiveType = dbEvent?.eventType || event.eventType;
  const type = EVENT_TYPES[effectiveType] || EVENT_TYPES.event;
  const canEdit = onTypeChange && dbEvent;

  const handleTypeSelect = async (e) => {
    const newType = e.target.value;
    setEditing(false);
    if (newType !== effectiveType) await onTypeChange(dbEvent.id, newType);
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border overflow-hidden transition-all ${
        isPast
          ? 'opacity-60 border-slate-200 dark:border-slate-700'
          : `${type.border} hover:shadow-md hover:-translate-y-0.5`
      } ${event.isCancelled ? 'opacity-40' : ''}`}
    >
      <div className={`h-1.5 ${type.color}`} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          {canEdit && editing ? (
            <select
              autoFocus
              onBlur={() => setEditing(false)}
              onChange={handleTypeSelect}
              defaultValue={effectiveType}
              className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white outline-none cursor-pointer"
            >
              {Object.entries(EVENT_TYPES).map(([key, et]) => (
                <option key={key} value={key}>
                  {et.label}
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={canEdit ? () => setEditing(true) : undefined}
              className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex items-center gap-1 ${type.colorLight} ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
              title={canEdit ? t('schedule.clickToChangeType') : undefined}
            >
              {type.label}
              {dbEvent?.typeLocked && <Lock size={8} className="opacity-60" />}
            </button>
          )}
          <span className="text-[11px] font-bold text-slate-400">{event.displayDate}</span>
        </div>
        <h4
          className={`font-black text-slate-900 dark:text-white text-sm leading-tight mb-3 ${event.isCancelled ? 'line-through' : ''}`}
        >
          {event.title}
        </h4>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Clock size={12} className="text-slate-400 shrink-0" />
            <span className="font-medium">{event.displayTime}</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
            <MapPin size={12} className="text-slate-400 shrink-0 mt-0.5" />
            <span className="font-medium leading-tight" title={event.location}>
              {event.location}
            </span>
          </div>
        </div>

        {/* Expense badge — only for synced events when admin */}
        {dbEvent && onManageExpenses && (
          <button
            onClick={() => onManageExpenses(dbEvent)}
            className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
          >
            {expenseSummary && expenseSummary.total > 0 ? (
              <>
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <DollarSign size={11} className="text-slate-400" />
                  {expenseSummary.paid}/{expenseSummary.count} {t('schedule.paid').toLowerCase()}
                </span>
                {expenseSummary.remaining > 0 ? (
                  <span className="text-[10px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                    ${expenseSummary.remaining.toFixed(2)} {t('schedule.due')}
                  </span>
                ) : (
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <CheckCircle2 size={9} /> {t('schedule.paid')}
                  </span>
                )}
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 group-hover:text-slate-600 mx-auto">
                <DollarSign size={11} /> {t('schedule.manageExpenses')}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Next-up highlight banner ──────────────────────────────────
const NextUpBanner = ({ event }) => {
  const { t } = useT();
  if (!event) return null;
  const type = EVENT_TYPES[event.eventType] || EVENT_TYPES.event;
  return (
    <div
      className={`rounded-2xl border ${type.border} bg-white dark:bg-slate-900 p-4 flex items-center gap-4 shadow-sm dark:shadow-none`}
    >
      <div className={`w-1 self-stretch rounded-full ${type.color}`} />
      <div className="flex-grow min-w-0">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('schedule.nextUp')}</p>
        <p className="font-black text-slate-900 dark:text-white text-sm truncate">{event.title}</p>
        <div className="flex items-center gap-3 mt-1 text-[11px] font-bold text-slate-400">
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {event.displayDate}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {event.displayTime}
          </span>
          <span className="flex items-center gap-1 truncate">
            <MapPin size={11} />
            {event.location}
          </span>
        </div>
      </div>
      <span
        className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${type.colorLight}`}
      >
        {type.label}
      </span>
    </div>
  );
};

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
  transactions = [],
  onSaveExpense = null,
  onToggleCleared = null,
  onDeleteExpense = null,
  seasonIds = [],
  selectedSeason,
}) {
  const { t } = useT();
  const [tab, setTab] = useState('upcoming');
  const [isSyncing, setIsSyncing] = useState(false);
  const [expenseModalEvent, setExpenseModalEvent] = useState(null);

  // Map iCal event UID → DB event so EventCards can show/edit the locked type
  const dbEventsByUid = useMemo(() => {
    const map = {};
    teamEvents.forEach((e) => {
      map[e.uid] = e;
    });
    return map;
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
    const total = expenses.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const paidItems = expenses.filter((tx) => tx.cleared);
    const paidTotal = paidItems.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    return { count: expenses.length, total, paid: paidItems.length, remaining: total - paidTotal };
  };

  // Filter events to selected season
  const seasonEvents = useMemo(() => {
    if (!selectedSeason) return events;
    return filterEventsBySeason(events, selectedSeason);
  }, [events, selectedSeason]);

  const handleSync = async () => {
    if (!onSyncCalendar) return;
    setIsSyncing(true);
    try {
      await onSyncCalendar();
    } finally {
      setIsSyncing(false);
    }
  };
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const currentIcsUrl = selectedTeam?.icalUrl || '';

  const ALL_TABS = [
    { id: 'upcoming', label: t('schedule.upcoming'), icon: Calendar },
    { id: 'past', label: t('schedule.past'), icon: History },
    { id: 'calendar', label: t('schedule.calendar'), icon: CalendarDays },
  ];

  const applyFilters = (list) => {
    let result = list;
    if (typeFilter !== 'all') result = result.filter((e) => e.eventType === typeFilter);
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
    [seasonEvents.upcoming, typeFilter, searchTerm],
  );
  const filteredPast = useMemo(() => applyFilters(seasonEvents.past), [seasonEvents.past, typeFilter, searchTerm]);
  const hasFilters = typeFilter !== 'all' || searchTerm;

  const FilterBar = () => (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
        <input
          type="text"
          placeholder={t('schedule.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-2.5 text-slate-300 hover:text-slate-500"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-slate-400" />
        <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${typeFilter === 'all' ? 'bg-white dark:bg-slate-900 shadow-sm dark:shadow-none text-slate-900 dark:text-white' : 'text-slate-500'}`}
          >
            {t('common.all')}
          </button>
          {Object.entries(EVENT_TYPES).map(([key, type]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                typeFilter === key
                  ? 'bg-white dark:bg-slate-900 shadow-sm dark:shadow-none text-slate-900 dark:text-white'
                  : 'text-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${type.dot}`} />
              {type.label}
            </button>
          ))}
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              setTypeFilter('all');
              setSearchTerm('');
            }}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 ml-auto"
          >
            <X size={12} /> {t('common.reset')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t('schedule.title')}</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {t('schedule.upcomingStat', { n: seasonEvents.upcoming.length })} ·{' '}
            {t('schedule.pastStat', { n: seasonEvents.past.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditSchedule && currentIcsUrl && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? t('schedule.syncing') : t('schedule.sync')}
            </button>
          )}
          {currentIcsUrl && (
            <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              {t('schedule.live')}
            </span>
          )}
        </div>
      </div>

      {/* ── No feed warning (non-admins only) ── */}
      {!currentIcsUrl && !canEditSchedule && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700 font-medium">{t('schedule.noFeed')}</p>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 w-fit">
        {ALL_TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === tb.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm dark:shadow-none'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <tb.icon size={14} />
            {tb.label}
            {tb.id === 'upcoming' && seasonEvents.upcoming.length > 0 && (
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  tab === 'upcoming'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                }`}
              >
                {seasonEvents.upcoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Upcoming ── */}
      {tab === 'upcoming' && (
        <>
          <NextUpBanner event={seasonEvents.upcoming[0]} />
          <FilterBar />
          {filteredUpcoming.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-slate-400 font-bold italic text-sm">
              {hasFilters ? t('schedule.noFilterMatch') : t('schedule.noUpcoming')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUpcoming.map((e) => {
                const db = dbEventsByUid[e.id];
                return (
                  <EventCard
                    key={e.id}
                    event={e}
                    dbEvent={db}
                    onTypeChange={onTypeChange}
                    expenseSummary={getExpenseSummary(db)}
                    onManageExpenses={canEditSchedule ? setExpenseModalEvent : null}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Past ── */}
      {tab === 'past' && (
        <>
          <FilterBar />
          {filteredPast.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-slate-400 font-bold italic text-sm">
              {hasFilters ? t('schedule.noFilterMatch') : t('schedule.noPast')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredPast.map((e) => {
                const db = dbEventsByUid[e.id];
                return (
                  <EventCard
                    key={e.id}
                    event={e}
                    isPast
                    dbEvent={db}
                    onTypeChange={onTypeChange}
                    expenseSummary={getExpenseSummary(db)}
                    onManageExpenses={canEditSchedule ? setExpenseModalEvent : null}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Calendar ── */}
      {tab === 'calendar' && (
        <div className="w-full overflow-x-auto pb-4">
          <div className="min-w-[640px]">
            <CalendarView events={events} blackoutDates={blackoutDates} onToggleBlackout={onToggleBlackout} />
          </div>
        </div>
      )}

      {/* ── Event Expense Modal ── */}
      <EventExpenseModal
        show={!!expenseModalEvent}
        onClose={() => setExpenseModalEvent(null)}
        dbEvent={expenseModalEvent}
        linkedTransactions={expenseModalEvent ? txByEventId[expenseModalEvent.id] || [] : []}
        onSaveExpense={onSaveExpense}
        onToggleCleared={onToggleCleared}
        onDeleteExpense={onDeleteExpense}
        seasonIds={seasonIds}
      />
    </div>
  );
}
