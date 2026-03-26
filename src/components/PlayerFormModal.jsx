import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Archive } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { getUSAgeGroup, getAge } from '../utils/ageGroup';

export default function PlayerFormModal({
  show,
  onClose,
  onSubmit,
  onArchive,
  initialData,
  isSubmitting,
  selectedSeason,
}) {
  const { t } = useT();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    jerseyNumber: '',
    birthdate: '',
    gender: '',
    status: 'active',
    guardians: [{ name: '', email: '', phone: '' }],
  });

  useEffect(() => {
    if (initialData) {
      // Normalize birthdate to YYYY-MM-DD for the date input
      let bd = initialData.birthdate || '';
      if (bd && bd.length > 10) bd = bd.slice(0, 10);
      setFormData({
        ...initialData,
        birthdate: bd,
        gender: initialData.gender || '',
        guardians: initialData.guardians?.length ? initialData.guardians : [{ name: '', email: '', phone: '' }],
        status: initialData.status || 'active',
      });
    } else {
      setFormData({
        firstName: '',
        lastName: '',
        jerseyNumber: '',
        birthdate: '',
        gender: '',
        status: 'active',
        guardians: [{ name: '', email: '', phone: '' }],
      });
    }
  }, [initialData, show, selectedSeason]);

  if (!show) return null;

  const handleGuardianChange = (index, field, value) => {
    const newGuardians = [...formData.guardians];
    newGuardians[index][field] = value;
    setFormData({ ...formData, guardians: newGuardians });
  };

  const addGuardian = () => {
    setFormData({ ...formData, guardians: [...formData.guardians, { name: '', email: '', phone: '' }] });
  };

  const removeGuardian = (index) => {
    const newGuardians = formData.guardians.filter((_, i) => i !== index);
    setFormData({ ...formData, guardians: newGuardians });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Safely update the player's season profile while preserving existing
    // data like baseFee and feeWaived managed by the Budget view
    const profiles = initialData?.seasonProfiles || {};
    profiles[selectedSeason] = {
      ...(profiles[selectedSeason] || {}),
      status: formData.status,
    };

    const submissionData = {
      ...formData,
      seasonProfiles: profiles,
    };

    onSubmit(submissionData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl dark:shadow-none w-full max-w-lg my-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-black text-slate-800 dark:text-white">
            {initialData ? t('playerForm.editTitle') : t('playerForm.addTitle')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                {t('playerForm.firstName')}
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                {t('playerForm.lastName')}
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                {t('playerForm.jerseyNum')}
              </label>
              <input
                type="text"
                value={formData.jerseyNumber}
                onChange={(e) => setFormData({ ...formData, jerseyNumber: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                {t('common.status')}
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
              >
                <option value="active">{t('playerForm.active')}</option>
                <option value="archived">{t('playerForm.archivedInactive')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
                {t('playerForm.birthdate')}
              </label>
              <input
                type="date"
                value={formData.birthdate || ''}
                onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex items-end pb-2">
              {formData.birthdate && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">
                    {t('playerForm.age')}:{' '}
                    <span className="text-slate-700 dark:text-slate-300">{getAge(formData.birthdate)}</span>
                  </span>
                  {selectedSeason && (
                    <span className="text-xs font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {getUSAgeGroup(formData.birthdate, selectedSeason) || '—'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
              {t('playerForm.gender', 'Gender')}
            </label>
            <select
              value={formData.gender || ''}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
            >
              <option value="">{t('playerForm.selectGender', '— Select —')}</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                {t('playerForm.guardianInfo')}
              </label>
              <button
                type="button"
                onClick={addGuardian}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus size={14} /> {t('playerForm.addAnother')}
              </button>
            </div>

            <div className="space-y-4">
              {formData.guardians.map((guardian, index) => (
                <div
                  key={index}
                  className="flex gap-2 items-start bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none relative"
                >
                  <div className="flex-grow space-y-2">
                    <input
                      type="text"
                      placeholder={t('playerForm.fullName')}
                      required
                      value={guardian.name}
                      onChange={(e) => handleGuardianChange(index, 'name', e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded md p-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
                    />
                    <input
                      type="email"
                      placeholder={t('playerForm.emailLogin')}
                      required
                      value={guardian.email}
                      onChange={(e) => handleGuardianChange(index, 'email', e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded md p-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
                    />
                    <input
                      type="tel"
                      placeholder={t('playerForm.phoneNumber')}
                      value={guardian.phone}
                      onChange={(e) => handleGuardianChange(index, 'phone', e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-700 rounded md p-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  {formData.guardians.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGuardian(index)}
                      className="text-red-400 hover:text-red-600 mt-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
            {initialData ? (
              <button
                type="button"
                onClick={() => onArchive(initialData.id)}
                className="px-4 py-2 font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Archive size={16} /> {t('playerForm.archive')}
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting
                  ? t('common.saving')
                  : initialData
                    ? t('playerForm.updatePlayer')
                    : t('playerForm.addPlayer')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
