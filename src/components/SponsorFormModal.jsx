import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handshake, ImageUp, Trash2, Loader2 } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import ResponsiveModal from './layout/ResponsiveModal';
import { SPONSOR_STATUSES, MAX_LOGO_BYTES, ACCEPTED_LOGO_TYPES, sponsorInitials } from '../utils/sponsors';

const emptySponsor = {
  name: '',
  tier: '',
  status: 'prospect',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  committedAmount: '',
  renewalDate: '',
  notes: '',
};

/**
 * Add/edit panel for one sponsor. The logo is staged locally and only leaves
 * the browser when the panel is saved, so backing out of an edit cannot orphan
 * an uploaded file.
 *
 * Mounted only while open (and keyed by sponsor) so the form seeds itself from
 * props once and needs no effect to re-sync.
 */
export default function SponsorFormModal({ sponsor, onClose, onSave, isSaving }) {
  const { t } = useT();
  const fileRef = useRef(null);
  const [form, setForm] = useState(() =>
    sponsor
      ? {
          ...emptySponsor,
          ...sponsor,
          committedAmount: sponsor.committedAmount ? String(sponsor.committedAmount) : '',
          renewalDate: sponsor.renewalDate || '',
        }
      : emptySponsor,
  );
  const [logoFile, setLogoFile] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState('');

  // Object URLs are a leak if they outlive the picked file.
  const stagedPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => () => stagedPreview && URL.revokeObjectURL(stagedPreview), [stagedPreview]);

  const currentLogo = stagedPreview || (removeLogo ? null : sponsor?.logoUrl) || null;
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setError(t('sponsors.directory.logoTypeError'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t('sponsors.directory.logoSizeError'));
      return;
    }
    setError('');
    setLogoFile(file);
    setRemoveLogo(false);
  };

  const clearLogo = () => {
    setLogoFile(null);
    setRemoveLogo(true);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('sponsors.directory.nameRequired'));
      return;
    }
    setError('');
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        committedAmount: parseFloat(form.committedAmount) || 0,
        logoFile,
        removeLogo: removeLogo && !logoFile,
      });
      onClose();
    } catch (err) {
      setError(err.message || t('sponsors.directory.saveError'));
    }
  };

  const field =
    'w-full border border-border rounded-lg p-2 bg-background focus:ring-2 focus:ring-emerald-500 outline-none';
  const labelClass = 'block text-sm font-semibold text-foreground mb-1';

  return (
    <ResponsiveModal as="form" onSubmit={handleSubmit} onClose={onClose} size="2xl" overlayClassName="z-[1060]">
      <ResponsiveModal.Header className="bg-emerald-600 text-white">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Handshake size={18} />
          {sponsor ? t('sponsors.directory.editHeading') : t('sponsors.directory.addHeading')}
        </h3>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="space-y-4">
        {/* LOGO */}
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden">
            {currentLogo ? (
              <img src={currentLogo} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xl font-bold text-muted-foreground">{sponsorInitials(form.name)}</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_LOGO_TYPES.join(',')}
              onChange={handleFile}
              className="hidden"
              id="sponsor-logo-input"
            />
            <label
              htmlFor="sponsor-logo-input"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-background cursor-pointer w-fit"
            >
              <ImageUp size={14} /> {t('sponsors.directory.chooseLogo')}
            </label>
            {currentLogo && (
              <button
                type="button"
                onClick={clearLogo}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 w-fit"
              >
                <Trash2 size={13} /> {t('sponsors.directory.removeLogo')}
              </button>
            )}
            <span className="text-[11px] text-muted-foreground font-medium">{t('sponsors.directory.logoHint')}</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="sponsor-name">
              {t('sponsors.directory.name')}
            </label>
            <input required id="sponsor-name" value={form.name} onChange={set('name')} className={field} />
          </div>

          <div>
            <label className={labelClass} htmlFor="sponsor-tier">
              {t('sponsors.directory.tier')}
            </label>
            <input
              id="sponsor-tier"
              value={form.tier}
              onChange={set('tier')}
              className={field}
              placeholder={t('sponsors.directory.tierPlaceholder')}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="sponsor-status">
              {t('sponsors.directory.status')}
            </label>
            <select id="sponsor-status" value={form.status} onChange={set('status')} className={field}>
              {SPONSOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`sponsors.directory.statuses.${s}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="sponsor-amount">
              {t('sponsors.directory.committed')}
            </label>
            <input
              id="sponsor-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.committedAmount}
              onChange={set('committedAmount')}
              className={field}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="sponsor-renewal">
              {t('sponsors.directory.renewal')}
            </label>
            <input
              id="sponsor-renewal"
              type="date"
              value={form.renewalDate}
              onChange={set('renewalDate')}
              className={field}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="sponsor-contact">
              {t('sponsors.directory.contactName')}
            </label>
            <input id="sponsor-contact" value={form.contactName} onChange={set('contactName')} className={field} />
          </div>

          <div>
            <label className={labelClass} htmlFor="sponsor-email">
              {t('sponsors.directory.email')}
            </label>
            <input id="sponsor-email" type="email" value={form.email} onChange={set('email')} className={field} />
          </div>

          <div>
            <label className={labelClass} htmlFor="sponsor-phone">
              {t('sponsors.directory.phone')}
            </label>
            <input id="sponsor-phone" type="tel" value={form.phone} onChange={set('phone')} className={field} />
          </div>

          <div>
            <label className={labelClass} htmlFor="sponsor-website">
              {t('sponsors.directory.website')}
            </label>
            <input
              id="sponsor-website"
              value={form.website}
              onChange={set('website')}
              className={field}
              placeholder="example.com"
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="sponsor-address">
              {t('sponsors.directory.address')}
            </label>
            <input id="sponsor-address" value={form.address} onChange={set('address')} className={field} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="sponsor-notes">
              {t('sponsors.directory.notes')}
            </label>
            <textarea
              id="sponsor-notes"
              rows={3}
              value={form.notes}
              onChange={set('notes')}
              className={field}
              placeholder={t('sponsors.directory.notesPlaceholder')}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </ResponsiveModal.Body>

      <ResponsiveModal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-border bg-card hover:bg-background"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
        >
          {isSaving && <Loader2 size={14} className="animate-spin" />}
          {t('common.save')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
