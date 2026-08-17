// src/services/fieldService.js
// The club's home field: what fields exist, who has booked a block, and
// when the field is shut. Bookings are club-wide by design — every team
// reads the same grid, which is the only way "is Saturday at 10 free?"
// has one answer.

import { supabase } from '../supabase';
import { canTransition, BOOKING_STATUS } from '../utils/fieldSlots';

const mapField = (f) => ({
  id: f.id,
  clubId: f.club_id,
  name: f.name,
  shortName: f.short_name || f.name,
  location: f.location || '',
  sortOrder: f.sort_order ?? 0,
  isActive: f.is_active !== false,
});

const mapBooking = (b) => ({
  id: b.id,
  clubId: b.club_id,
  fieldId: b.field_id,
  teamId: b.team_id,
  seasonId: b.season_id,
  bookingDate: b.booking_date,
  slotTime: b.slot_time,
  status: b.status,
  managerName: b.manager_name || '',
  opponentName: b.opponent_name || '',
  ageGroup: b.age_group || '',
  gameType: b.game_type || '',
  refereesNeeded: Number(b.referees_needed) || 0,
  notes: b.notes || '',
  requestedBy: b.requested_by,
  decidedBy: b.decided_by,
  decidedAt: b.decided_at,
  declineReason: b.decline_reason || '',
  createdAt: b.created_at,
  updatedAt: b.updated_at,
});

const bookingRow = (b) => ({
  ...(b.clubId !== undefined ? { club_id: b.clubId } : {}),
  ...(b.fieldId !== undefined ? { field_id: b.fieldId } : {}),
  ...(b.teamId !== undefined ? { team_id: b.teamId || null } : {}),
  ...(b.seasonId !== undefined ? { season_id: b.seasonId || null } : {}),
  ...(b.bookingDate !== undefined ? { booking_date: b.bookingDate } : {}),
  ...(b.slotTime !== undefined ? { slot_time: b.slotTime } : {}),
  ...(b.status !== undefined ? { status: b.status } : {}),
  ...(b.managerName !== undefined ? { manager_name: b.managerName } : {}),
  ...(b.opponentName !== undefined ? { opponent_name: b.opponentName } : {}),
  ...(b.ageGroup !== undefined ? { age_group: b.ageGroup } : {}),
  ...(b.gameType !== undefined ? { game_type: b.gameType } : {}),
  ...(b.refereesNeeded !== undefined ? { referees_needed: Number(b.refereesNeeded) || 0 } : {}),
  ...(b.notes !== undefined ? { notes: b.notes } : {}),
  ...(b.requestedBy !== undefined ? { requested_by: b.requestedBy || null } : {}),
  ...(b.declineReason !== undefined ? { decline_reason: b.declineReason } : {}),
});

const mapClosure = (c) => ({
  id: c.id,
  clubId: c.club_id,
  fieldId: c.field_id,
  startDate: c.start_date,
  endDate: c.end_date,
  slotTime: c.slot_time,
  reason: c.reason || '',
  createdBy: c.created_by,
  createdAt: c.created_at,
});

export const fieldService = {
  getFields: async (clubId) => {
    if (!clubId) return [];
    const { data, error } = await supabase
      .from('fields')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapField);
  },

  /**
   * Bookings in a date window. The view only ever renders a weekend or two,
   * so fetching the whole season would be pulling a year of rows to draw ten
   * blocks — the window is passed in and the query stays small.
   */
  getBookings: async (clubId, { from, to } = {}) => {
    if (!clubId || !from || !to) return [];
    const { data, error } = await supabase
      .from('field_bookings')
      .select('*')
      .eq('club_id', clubId)
      .gte('booking_date', from)
      .lte('booking_date', to)
      .order('booking_date', { ascending: true })
      .order('slot_time', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapBooking);
  },

  /** Every request still waiting on a club admin, whatever date it is for. */
  getPendingBookings: async (clubId) => {
    if (!clubId) return [];
    const { data, error } = await supabase
      .from('field_bookings')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', BOOKING_STATUS.pending)
      .order('booking_date', { ascending: true })
      .order('slot_time', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapBooking);
  },

  createBooking: async (booking) => {
    const { data, error } = await supabase
      .from('field_bookings')
      .insert(bookingRow({ status: BOOKING_STATUS.pending, ...booking }))
      .select()
      .single();
    if (error) throw error;
    return mapBooking(data);
  },

  updateBooking: async (id, updates) => {
    const { data, error } = await supabase
      .from('field_bookings')
      .update(bookingRow(updates))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapBooking(data);
  },

  deleteBooking: async (id) => {
    const { error } = await supabase.from('field_bookings').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Approve, decline or cancel. The legal moves are checked here so a bad
   * transition fails before it reaches the database; who is *allowed* to
   * approve is enforced by the trigger in sql/field_scheduling_migration.sql,
   * because that one must not be bypassable from the client.
   */
  setBookingStatus: async (booking, status, { declineReason = '' } = {}) => {
    if (!canTransition(booking.status, status)) {
      throw new Error(`Cannot move a booking from "${booking.status}" to "${status}"`);
    }
    return fieldService.updateBooking(booking.id, {
      status,
      ...(status === BOOKING_STATUS.declined ? { declineReason } : {}),
    });
  },

  /**
   * Approve a request. Confirming settles the whole block — every other
   * request for that field, day and time is declined by the database in the
   * same transaction (settle_field_booking_slot). It happens there rather
   * than here because a team manager can confirm their own booking but has
   * no right to write another team's rows, so a client-side cascade would
   * silently do nothing and leave the losers pending on a slot already gone.
   *
   * The caller should refetch: rows this client never loaded may have changed.
   */
  approveBooking: async (booking) => fieldService.setBookingStatus(booking, BOOKING_STATUS.confirmed),

  getClosures: async (clubId) => {
    if (!clubId) return [];
    const { data, error } = await supabase
      .from('field_closures')
      .select('*')
      .eq('club_id', clubId)
      .order('start_date', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapClosure);
  },

  createClosure: async ({
    clubId,
    fieldId = null,
    startDate,
    endDate,
    slotTime = null,
    reason = '',
    createdBy = null,
  }) => {
    const { data, error } = await supabase
      .from('field_closures')
      .insert({
        club_id: clubId,
        field_id: fieldId || null,
        start_date: startDate,
        end_date: endDate || startDate,
        slot_time: slotTime || null,
        reason,
        created_by: createdBy || null,
      })
      .select()
      .single();
    if (error) throw error;
    return mapClosure(data);
  },

  deleteClosure: async (id) => {
    const { error } = await supabase.from('field_closures').delete().eq('id', id);
    if (error) throw error;
  },
};

export default fieldService;
