// src/components/FieldClosureModal.jsx
// Taking the field off the board — a holiday weekend, resodding, a storm.
// A closure is a date range rather than a per-day toggle because that is
// how the field is actually lost: for a week, not for a Tuesday.

import { useState } from 'react';
import { useT } from '../i18n/I18nContext';
import { ResponsiveModal, FormRow, formControl } from './layout';
import { SLOT_TIMES, formatSlot } from '../utils/fieldSlots';

export default function FieldClosureModal({
  open = true,
  fields = [],
  closures = [],
  defaultDate,
  defaultFieldId = null,
  defaultSlotTime = null,
  onCreate,
  onDelete,
  onClose,
}) {
  const { t } = useT();

  const [form, setForm] = useState({
    fieldId: defaultFieldId || '',
    startDate: defaultDate,
    endDate: defaultDate,
    slotTime: defaultSlotTime || '',
    reason: '',
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
      await onCreate({
        fieldId: form.fieldId || null,
        startDate: form.startDate,
        // A one-day closure is the common case; leaving the end blank means
        // "just this day" rather than an open-ended shutdown.
        endDate: form.endDate || form.startDate,
        slotTime: form.slotTime || null,
        reason: form.reason,
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const fieldLabel = (fieldId) => fields.find((f) => f.id === fieldId)?.shortName || t('fieldSchedule.allFields');

  return (
    <ResponsiveModal open={open} onClose={onClose} as="form" onSubmit={handleSubmit} size="lg">
      <ResponsiveModal.Header className="border-b border-border">
        <h2 className="text-lg font-bold text-foreground">{t('fieldSchedule.closeField')}</h2>
        <p className="text-sm text-muted-foreground">{t('fieldSchedule.closeFieldHint')}</p>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="space-y-4">
        <FormRow label={t('fieldSchedule.field')} htmlFor="fc-field">
          <select id="fc-field" value={form.fieldId} onChange={set('fieldId')} className={formControl}>
            <option value="">{t('fieldSchedule.allFields')}</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label={t('fieldSchedule.from')} htmlFor="fc-start">
          <input
            id="fc-start"
            type="date"
            required
            value={form.startDate}
            onChange={set('startDate')}
            className={formControl}
          />
        </FormRow>

        <FormRow label={t('fieldSchedule.to')} htmlFor="fc-end">
          <input
            id="fc-end"
            type="date"
            min={form.startDate}
            value={form.endDate}
            onChange={set('endDate')}
            className={formControl}
          />
        </FormRow>

        <FormRow label={t('fieldSchedule.timeBlock')} htmlFor="fc-slot" help={t('fieldSchedule.timeBlockHelp')}>
          <select id="fc-slot" value={form.slotTime} onChange={set('slotTime')} className={formControl}>
            <option value="">{t('fieldSchedule.wholeDay')}</option>
            {SLOT_TIMES.map((slot) => (
              <option key={slot} value={slot}>
                {formatSlot(slot)}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label={t('fieldSchedule.reason')} htmlFor="fc-reason">
          <input
            id="fc-reason"
            type="text"
            value={form.reason}
            onChange={set('reason')}
            placeholder={t('fieldSchedule.reasonPlaceholder')}
            className={formControl}
          />
        </FormRow>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </p>
        )}

        {closures.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t('fieldSchedule.existingClosures')}
            </p>
            {closures.map((closure) => (
              <div
                key={closure.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-foreground">{fieldLabel(closure.fieldId)}</span>
                <span className="text-muted-foreground">
                  {closure.startDate}
                  {closure.endDate !== closure.startDate ? ` → ${closure.endDate}` : ''}
                  {closure.slotTime ? ` · ${formatSlot(closure.slotTime)}` : ''}
                </span>
                {closure.reason && <span className="text-muted-foreground">· {closure.reason}</span>}
                <button
                  type="button"
                  onClick={() => onDelete(closure.id)}
                  className="ml-auto rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                >
                  {t('fieldSchedule.reopen')}
                </button>
              </div>
            ))}
          </div>
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
          {saving ? t('common.saving') : t('fieldSchedule.closeSlot')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
