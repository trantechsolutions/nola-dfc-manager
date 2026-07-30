import React, { useState, useEffect } from 'react';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { useT } from '../../i18n/I18nContext';

const MIN_PASSWORD_LENGTH = 6;

export default function ResetPasswordView() {
  const { t } = useT();
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // The recovery link's hash is what got us rendered (see App.jsx), but the
  // token inside it can still be expired/already-used — confirm a session
  // actually exists before showing the form instead of failing on submit.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionValid(!!session);
      setCheckingSession(false);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('auth.resetPasswordTooShort', { n: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.resetPasswordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setSuccess(true);
      // Clear the temporary recovery session and reload to a clean, hash-free
      // URL so the user signs in fresh with the new password. The password is
      // already changed at this point, so redirect regardless of whether
      // signOut() itself succeeds — never strand the user on "Redirecting…".
      supabase.auth
        .signOut()
        .catch(() => {})
        .finally(() => setTimeout(() => window.location.assign('/'), 1800));
    } catch {
      setError(t('auth.resetPasswordFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-card p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <KeyRound size={24} className="text-blue-700 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">{t('auth.resetPasswordTitle')}</h2>
        </div>

        {checkingSession ? (
          <p className="text-center text-sm text-muted-foreground font-semibold py-6">{t('common.loading')}...</p>
        ) : !sessionValid ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-red-700 dark:text-red-400 font-semibold">{t('auth.resetLinkExpired')}</p>
            <a
              href="/"
              className="inline-block text-sm font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800"
            >
              {t('auth.backToLogin')}
            </a>
          </div>
        ) : success ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 size={32} className="text-emerald-600 mx-auto" />
            <p className="text-sm font-semibold text-foreground">{t('auth.resetPasswordSuccess')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 dark:text-red-400 rounded-lg text-xs font-semibold border border-red-100">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">{t('auth.newPassword')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-ring transition-all"
                placeholder={t('auth.passwordPlaceholder')}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {t('auth.confirmPassword')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-ring transition-all"
                placeholder={t('auth.passwordPlaceholder')}
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent text-accent-foreground font-semibold py-3 rounded-lg hover:bg-accent/90 transition-all shadow-lg disabled:opacity-50"
            >
              {submitting ? t('common.saving') : t('auth.resetPasswordSubmit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
