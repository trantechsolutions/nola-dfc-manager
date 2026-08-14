// src/hooks/useFieldSchedule.js
// Loads the club's home-field board for one weekend and exposes the
// actions that change it. The visible window drives the query — paging to
// the next weekend refetches rather than holding a season in memory.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fieldService } from '../services/fieldService';
import { useRealtimeRefresh } from './useRealtimeRefresh';
import { buildGrid, weekendDates, toDateStr, BOOKING_STATUS } from '../utils/fieldSlots';

export const useFieldSchedule = ({ clubId, seasonId = null, userId = null } = {}) => {
  // Which weekend is on screen. Anchored on today, so the board opens on the
  // weekend the club is about to play.
  const [anchorDate, setAnchorDate] = useState(() => toDateStr(new Date()));
  const [fields, setFields] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [closures, setClosures] = useState([]);
  // Requests waiting on a decision, across every date — not only the weekend
  // currently on screen.
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dates = useMemo(() => weekendDates(anchorDate), [anchorDate]);
  const [from, to] = [dates[0], dates[dates.length - 1]];

  const refresh = useCallback(async () => {
    if (!clubId) {
      setFields([]);
      setBookings([]);
      setClosures([]);
      setPendingRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [fieldRows, bookingRows, closureRows, pendingRows] = await Promise.all([
        fieldService.getFields(clubId),
        fieldService.getBookings(clubId, { from, to }),
        fieldService.getClosures(clubId),
        // Every waiting request, not just this weekend's: a request for three
        // weekends out would otherwise sit unseen until someone happened to
        // page forward to it.
        fieldService.getPendingBookings(clubId),
      ]);
      setFields(fieldRows);
      setBookings(bookingRows);
      setClosures(closureRows);
      setPendingRequests(pendingRows);
      setError(null);
    } catch (err) {
      console.error('Failed to load the field schedule:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clubId, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Two managers can be looking at the same Saturday; a block being taken
  // has to show up without a reload or they will both "book" it.
  useRealtimeRefresh(
    `field-schedule-${clubId || 'none'}`,
    [{ table: 'field_bookings' }, { table: 'field_closures' }],
    refresh,
    Boolean(clubId),
  );

  const grid = useMemo(() => buildGrid({ dates, fields, bookings, closures }), [dates, fields, bookings, closures]);

  /**
   * Writes a changed booking into both lists at once. The weekend on screen
   * and the pending queue overlap, and a booking that stops being pending
   * has to leave the queue or an admin keeps being asked to decide it again.
   */
  const applyBookings = useCallback((updated) => {
    const rows = Array.isArray(updated) ? updated : [updated];
    const byId = new Map(rows.map((row) => [row.id, row]));
    setBookings((prev) => prev.map((b) => byId.get(b.id) || b));
    setPendingRequests((prev) =>
      prev.map((b) => byId.get(b.id) || b).filter((b) => b.status === BOOKING_STATUS.pending),
    );
  }, []);

  const requestBooking = useCallback(
    async (booking) => {
      const created = await fieldService.createBooking({
        clubId,
        seasonId,
        requestedBy: userId,
        ...booking,
      });
      setBookings((prev) => [...prev, created]);
      if (created.status === BOOKING_STATUS.pending) {
        setPendingRequests((prev) => [...prev, created]);
      } else {
        // Booking a block outright settles it, so anything else queued for it
        // has just been declined by the database — refetch to see that.
        await refresh();
      }
      return created;
    },
    [clubId, seasonId, userId, refresh],
  );

  const updateBooking = useCallback(
    async (id, updates) => {
      const updated = await fieldService.updateBooking(id, updates);
      applyBookings(updated);
      return updated;
    },
    [applyBookings],
  );

  const setBookingStatus = useCallback(
    async (booking, status, options) => {
      const updated = await fieldService.setBookingStatus(booking, status, options);
      applyBookings(updated);
      return updated;
    },
    [applyBookings],
  );

  // Confirming settles the block in the database, declining whatever else was
  // queued for it — including requests this client never loaded. Refetching is
  // the only honest way to learn what that changed.
  const approveBooking = useCallback(
    async (booking) => {
      const approved = await fieldService.approveBooking(booking);
      applyBookings(approved);
      await refresh();
      return approved;
    },
    [applyBookings, refresh],
  );

  const deleteBooking = useCallback(async (id) => {
    await fieldService.deleteBooking(id);
    setBookings((prev) => prev.filter((b) => b.id !== id));
    setPendingRequests((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const createClosure = useCallback(
    async (closure) => {
      const created = await fieldService.createClosure({ clubId, createdBy: userId, ...closure });
      setClosures((prev) => [...prev, created]);
      return created;
    },
    [clubId, userId],
  );

  const deleteClosure = useCallback(async (id) => {
    await fieldService.deleteClosure(id);
    setClosures((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    anchorDate,
    setAnchorDate,
    dates,
    fields,
    bookings,
    closures,
    grid,
    pendingRequests,
    loading,
    error,
    refresh,
    requestBooking,
    updateBooking,
    setBookingStatus,
    approveBooking,
    deleteBooking,
    createClosure,
    deleteClosure,
  };
};

export default useFieldSchedule;
