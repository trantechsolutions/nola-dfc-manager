// src/views/club/FieldScheduleView.jsx
// The club's home field, as a board.
//
// This is the spreadsheet everyone in the club has been reading: a
// weekend at a time, one column per field, five fixed blocks a day, and
// a yellow band wherever nobody has claimed one yet. What it adds is the
// half the spreadsheet could never do — a team asks for a block instead
// of typing into a shared cell, a club admin says yes, and the block is
// then theirs and nobody else's.
//
// Closures are the other half: a field taken off the board reads closed
// with its reason, and there is nothing to book.

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Lock, Plus, Users, Check, X, Trash2, Pencil } from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import { SmallBox } from '../../components/layout';
import FieldBookingModal from '../../components/FieldBookingModal';
import FieldClosureModal from '../../components/FieldClosureModal';
import { useFieldSchedule } from '../../hooks/useFieldSchedule';
import {
  formatSlot,
  formatDayHeading,
  refereeTotal,
  openingsCount,
  toDateStr,
  addDays,
  weekendStart,
  BOOKING_STATUS,
} from '../../utils/fieldSlots';

const STATE_STYLES = {
  // The sheet's own yellow band: an opening you can claim.
  open: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60',
  pending: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/60',
  confirmed: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/60',
  closed: 'bg-muted border-border',
};

export default function FieldScheduleView({
  club,
  teams = [],
  user = null,
  selectedTeamId = null,
  selectedSeason = null,
  isClubAdmin = false,
  canBook = false,
  // A team manager (and any club admin) takes an open block outright. Everyone
  // else with schedule access files a request and waits on a club admin —
  // mirrored by guard_field_booking_decision() in the migration, which is what
  // actually enforces it.
  canBookDirectly = false,
  showToast = () => {},
  showConfirm = async () => true,
}) {
  const { t } = useT();
  const {
    anchorDate,
    setAnchorDate,
    dates,
    fields,
    closures,
    grid,
    pendingRequests,
    loading,
    error,
    requestBooking,
    updateBooking,
    setBookingStatus,
    approveBooking,
    deleteBooking,
    createClosure,
    deleteClosure,
  } = useFieldSchedule({ clubId: club?.id, seasonId: selectedSeason, userId: user?.id });

  // { field, date, slotTime, booking } — the block being booked or edited.
  const [bookingTarget, setBookingTarget] = useState(null);
  const [closureTarget, setClosureTarget] = useState(null);

  const teamName = useMemo(() => {
    const byId = new Map(teams.map((team) => [team.id, team.name]));
    return (teamId) => byId.get(teamId) || t('fieldSchedule.clubEvent');
  }, [teams, t]);

  // Whose bookings this user may edit. A club admin owns the whole board;
  // everyone else owns their own team's requests.
  const ownsBooking = (booking) => isClubAdmin || (booking.teamId && booking.teamId === selectedTeamId);

  const openings = openingsCount(grid);
  const refs = refereeTotal(grid);

  const handleSaveBooking = async (payload) => {
    if (bookingTarget?.booking) {
      await updateBooking(bookingTarget.booking.id, payload);
      showToast(t('fieldSchedule.toastUpdated'));
      return;
    }
    // Whoever runs a team's fixtures is not asking permission to use their own
    // club's field, so their booking lands confirmed rather than queuing behind
    // themselves. Confirming settles the block: any competing request for it is
    // declined by the database in the same transaction.
    await requestBooking({
      ...payload,
      status: canBookDirectly ? BOOKING_STATUS.confirmed : BOOKING_STATUS.pending,
    });
    showToast(canBookDirectly ? t('fieldSchedule.toastBooked') : t('fieldSchedule.toastRequested'));
  };

  const handleApprove = async (booking) => {
    try {
      await approveBooking(booking);
      showToast(t('fieldSchedule.toastApproved'));
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleDecline = async (booking) => {
    const ok = await showConfirm(t('fieldSchedule.confirmDecline'));
    if (!ok) return;
    try {
      await setBookingStatus(booking, BOOKING_STATUS.declined);
      showToast(t('fieldSchedule.toastDeclined'));
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleCancel = async (booking) => {
    const ok = await showConfirm(t('fieldSchedule.confirmCancel'));
    if (!ok) return;
    try {
      await setBookingStatus(booking, BOOKING_STATUS.cancelled);
      showToast(t('fieldSchedule.toastCancelled'));
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleDelete = async (booking) => {
    const ok = await showConfirm(t('fieldSchedule.confirmDelete'));
    if (!ok) return;
    await deleteBooking(booking.id);
    showToast(t('fieldSchedule.toastDeleted'));
  };

  return (
    <div className="space-y-4">
      {/* ═══ WEEKEND PAGER ═══ */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
        <button
          onClick={() => setAnchorDate(addDays(anchorDate, -7))}
          aria-label={t('fieldSchedule.previousWeekend')}
          className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => setAnchorDate(addDays(anchorDate, 7))}
          aria-label={t('fieldSchedule.nextWeekend')}
          className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronRight size={16} />
        </button>

        <span className="flex items-center gap-2 px-1 text-sm font-bold text-foreground">
          <CalendarDays size={16} className="text-muted-foreground" />
          {formatDayHeading(dates[0])} – {formatDayHeading(dates[dates.length - 1])}
        </span>

        <input
          type="date"
          value={anchorDate}
          onChange={(e) => e.target.value && setAnchorDate(weekendStart(e.target.value))}
          aria-label={t('fieldSchedule.jumpToDate')}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
        />

        <button
          onClick={() => setAnchorDate(toDateStr(new Date()))}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          {t('fieldSchedule.thisWeekend')}
        </button>

        {isClubAdmin && (
          <button
            onClick={() => setClosureTarget({ date: dates[0] })}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Lock size={14} />
            {t('fieldSchedule.closeField')}
          </button>
        )}
      </div>

      {/* ═══ THE WEEKEND AT A GLANCE ═══ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SmallBox label={t('fieldSchedule.openings')} value={openings} icon={CalendarDays} tone="warning" />
        <SmallBox label={t('fieldSchedule.refereesNeeded')} value={refs} icon={Users} tone="primary" />
        <SmallBox label={t('fieldSchedule.fields')} value={fields.length} icon={CalendarDays} tone="muted" />
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* ═══ WAITING ON THE CLUB ═══
          Requests for any date, so one filed for a weekend nobody has paged
          to yet still gets an answer. */}
      {isClubAdmin && pendingRequests.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 shadow-sm dark:border-sky-800/60 dark:bg-sky-900/20">
          <p className="mb-2 text-sm font-bold text-foreground">
            {t('fieldSchedule.awaitingDecision', { count: pendingRequests.length })}
          </p>
          <ul className="space-y-1.5">
            {pendingRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  onClick={() => setAnchorDate(weekendStart(request.bookingDate))}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {formatDayHeading(request.bookingDate)} · {formatSlot(request.slotTime)}
                </button>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {teamName(request.teamId)}
                  {request.opponentName ? ` vs ${request.opponentName}` : ''}
                  {request.refereesNeeded ? ` · ${t('fieldSchedule.refCount', { count: request.refereesNeeded })}` : ''}
                </span>
                <button
                  onClick={() => handleApprove(request)}
                  className="rounded p-1.5 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                  title={t('fieldSchedule.approve')}
                >
                  <Check size={15} />
                </button>
                <button
                  onClick={() => handleDecline(request)}
                  className="rounded p-1.5 text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/40"
                  title={t('fieldSchedule.decline')}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500 dark:border-blue-800" />
        </div>
      ) : fields.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('fieldSchedule.noFields')}
        </div>
      ) : (
        grid.map((day) => (
          <section key={day.date} className="space-y-3">
            <h2 className="text-base font-bold text-foreground">{formatDayHeading(day.date)}</h2>

            <div className="grid gap-3 lg:grid-cols-2">
              {day.fields.map(({ field, slots }) => (
                <div key={field.id} className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-sm font-bold text-foreground">{field.name}</span>
                    {field.location && <span className="text-xs text-muted-foreground">{field.location}</span>}
                  </div>

                  <ul className="divide-y divide-border">
                    {slots.map((slot) => (
                      <li key={slot.slotTime} className={`border-l-4 px-3 py-2 ${STATE_STYLES[slot.state]}`}>
                        <SlotRow
                          slot={slot}
                          date={day.date}
                          field={field}
                          teamName={teamName}
                          canBook={canBook}
                          canBookDirectly={canBookDirectly}
                          isClubAdmin={isClubAdmin}
                          ownsBooking={ownsBooking}
                          onBook={() => setBookingTarget({ field, date: day.date, slotTime: slot.slotTime })}
                          onEdit={(booking) =>
                            setBookingTarget({ field, date: day.date, slotTime: slot.slotTime, booking })
                          }
                          onApprove={handleApprove}
                          onDecline={handleDecline}
                          onCancel={handleCancel}
                          onDelete={handleDelete}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <p className="text-xs text-muted-foreground">{t('fieldSchedule.refereeFootnote')}</p>

      {bookingTarget && (
        <FieldBookingModal
          field={bookingTarget.field}
          date={bookingTarget.date}
          slotTime={bookingTarget.slotTime}
          booking={bookingTarget.booking}
          teams={teams}
          defaultTeamId={selectedTeamId}
          canPickTeam={isClubAdmin}
          canBookDirectly={canBookDirectly}
          onSave={handleSaveBooking}
          onClose={() => setBookingTarget(null)}
        />
      )}

      {closureTarget && (
        <FieldClosureModal
          fields={fields}
          closures={closures}
          defaultDate={closureTarget.date}
          defaultFieldId={closureTarget.fieldId}
          defaultSlotTime={closureTarget.slotTime}
          onCreate={async (closure) => {
            await createClosure(closure);
            showToast(t('fieldSchedule.toastClosed'));
          }}
          onDelete={async (id) => {
            await deleteClosure(id);
            showToast(t('fieldSchedule.toastReopened'));
          }}
          onClose={() => setClosureTarget(null)}
        />
      )}
    </div>
  );
}

/** One block: what is in it, and what this user can do about it. */
function SlotRow({
  slot,
  teamName,
  canBook,
  canBookDirectly,
  isClubAdmin,
  ownsBooking,
  onBook,
  onEdit,
  onApprove,
  onDecline,
  onCancel,
  onDelete,
}) {
  const { t } = useT();
  const { state, booking, requests, closure } = slot;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-20 shrink-0 text-sm font-bold text-foreground">{formatSlot(slot.slotTime)}</span>

      {state === 'open' && (
        <>
          <span className="text-sm text-muted-foreground">{t('fieldSchedule.open')}</span>
          {canBook && (
            <button
              onClick={onBook}
              className="ml-auto flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus size={13} />
              {canBookDirectly ? t('fieldSchedule.book') : t('fieldSchedule.request')}
            </button>
          )}
        </>
      )}

      {state === 'closed' && (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock size={13} />
          {t('fieldSchedule.closed')}
          {closure?.reason ? ` — ${closure.reason}` : ''}
        </span>
      )}

      {(state === 'pending' || state === 'confirmed') && booking && (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {teamName(booking.teamId)}
              {booking.opponentName ? ` vs ${booking.opponentName}` : ''}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[
                booking.ageGroup,
                booking.gameType,
                booking.managerName,
                booking.refereesNeeded
                  ? t('fieldSchedule.refCount', { count: booking.refereesNeeded })
                  : t('fieldSchedule.noRefs'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
              state === 'confirmed'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                : 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300'
            }`}
          >
            {state === 'confirmed' ? t('fieldSchedule.confirmed') : t('fieldSchedule.pending')}
          </span>

          {/* Competing requests stay visible — a queue the admin has to settle,
              not a silent first-come-first-served win. */}
          {requests.length > 1 && state === 'pending' && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {t('fieldSchedule.competingRequests', { count: requests.length })}
            </span>
          )}

          <div className="flex shrink-0 items-center gap-1">
            {isClubAdmin && state === 'pending' && (
              <>
                <button
                  onClick={() => onApprove(booking)}
                  title={t('fieldSchedule.approve')}
                  className="rounded p-1.5 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                >
                  <Check size={15} />
                </button>
                <button
                  onClick={() => onDecline(booking)}
                  title={t('fieldSchedule.decline')}
                  className="rounded p-1.5 text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/40"
                >
                  <X size={15} />
                </button>
              </>
            )}
            {ownsBooking(booking) && (
              <>
                <button
                  onClick={() => onEdit(booking)}
                  title={t('common.edit')}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => (state === 'confirmed' ? onCancel(booking) : onDelete(booking))}
                  title={state === 'confirmed' ? t('fieldSchedule.cancelBooking') : t('common.delete')}
                  className="rounded p-1.5 text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/40"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
