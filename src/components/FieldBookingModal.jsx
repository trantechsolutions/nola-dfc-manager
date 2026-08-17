// src/components/FieldBookingModal.jsx
// Claiming a block. The fields mirror the spreadsheet's columns one for
// one — manager, matchup, age, type of game, referees — because that is
// what the club already fills in by hand every week.

import { useState } from 'react';
import { useT } from '../i18n/I18nContext';
import { ResponsiveModal, FormRow, formControl } from './layout';
import { formatSlot, formatDayHeading, GAME_TYPES } from '../utils/fieldSlots';

const REFEREE_OPTIONS = [0, 1, 2, 3, 4];

export default function FieldBookingModal({
  open = true,
  field,
  date,
  slotTime,
  booking = null,
  teams = [],
  defaultTeamId = null,
  canPickTeam = false,
  // True when saving books the block outright rather than filing a request.
  canBookDirectly = false,
  onSave,
  onClose,
}) {
  const { t } = useT();
  const isEdit = Boolean(booking);

  const [form, setForm] = useState({
    teamId: booking?.teamId ?? defaultTeamId ?? '',
    managerName: booking?.managerName ?? '',
    opponentName: booking?.opponentName ?? '',
    ageGroup: booking?.ageGroup ?? '',
    gameType: booking?.gameType ?? 'Friendly',
    refereesNeeded: booking?.refereesNeeded ?? 0,
    notes: booking?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...form,
        teamId: form.teamId || null,
        refereesNeeded: Number(form.refereesNeeded) || 0,
        fieldId: field.id,
        bookingDate: date,
        slotTime,
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} as="form" onSubmit={handleSubmit} size="lg">
      <ResponsiveModal.Header className="border-b border-border">
        <h2 className="text-lg font-bold text-foreground">
          {isEdit
            ? t('fieldSchedule.editBooking')
            : canBookDirectly
              ? t('fieldSchedule.bookSlot')
              : t('fieldSchedule.requestBooking')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {field?.shortName || field?.name} · {formatDayHeading(date)} · {formatSlot(slotTime)}
        </p>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="space-y-4">
        {canPickTeam && (
          <FormRow label={t('common.team')} htmlFor="fb-team">
            <select id="fb-team" value={form.teamId} onChange={set('teamId')} className={formControl}>
              <option value="">{t('fieldSchedule.clubEvent')}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </FormRow>
        )}

        <FormRow label={t('fieldSchedule.manager')} htmlFor="fb-manager">
          <input
            id="fb-manager"
            type="text"
            value={form.managerName}
            onChange={set('managerName')}
            placeholder={t('fieldSchedule.managerPlaceholder')}
            className={formControl}
          />
        </FormRow>

        <FormRow label={t('fieldSchedule.opponent')} htmlFor="fb-opponent" help={t('fieldSchedule.opponentHelp')}>
          <input
            id="fb-opponent"
            type="text"
            value={form.opponentName}
            onChange={set('opponentName')}
            placeholder={t('fieldSchedule.opponentPlaceholder')}
            className={formControl}
          />
        </FormRow>

        <FormRow label={t('fieldSchedule.age')} htmlFor="fb-age">
          <input
            id="fb-age"
            type="text"
            value={form.ageGroup}
            onChange={set('ageGroup')}
            placeholder={t('fieldSchedule.agePlaceholder')}
            className={formControl}
          />
        </FormRow>

        <FormRow label={t('fieldSchedule.gameType')} htmlFor="fb-type">
          <select id="fb-type" value={form.gameType} onChange={set('gameType')} className={formControl}>
            {GAME_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`fieldSchedule.gameTypes.${type}`, type)}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label={t('fieldSchedule.referees')} htmlFor="fb-refs" help={t('fieldSchedule.refereesHelp')}>
          <select id="fb-refs" value={form.refereesNeeded} onChange={set('refereesNeeded')} className={formControl}>
            {REFEREE_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label={t('fieldSchedule.notes')} htmlFor="fb-notes">
          <textarea
            id="fb-notes"
            rows={2}
            value={form.notes}
            onChange={set('notes')}
            placeholder={t('fieldSchedule.notesPlaceholder')}
            className={formControl}
          />
        </FormRow>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
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
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving
            ? t('common.saving')
            : isEdit
              ? t('common.save')
              : canBookDirectly
                ? t('fieldSchedule.book')
                : t('fieldSchedule.submitRequest')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
