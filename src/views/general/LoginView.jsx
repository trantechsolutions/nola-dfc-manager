import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { supabase } from '../../supabase';
import { useT } from '../../i18n/I18nContext';

export default function Login() {
  const { t, locale, toggleLocale } = useT();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegistering) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(isRegistering ? t('auth.errorCreate') : t('auth.errorLogin'));
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(t('auth.errorGoogle'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-2xl dark:shadow-none w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">NOLA DFC</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {isRegistering ? t('auth.createAccount') : t('auth.managerPortal')}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1">
              {t('auth.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:bg-slate-800 dark:text-white"
              placeholder={t('auth.emailPlaceholder')}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1">
              {t('auth.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:bg-slate-800 dark:text-white"
              placeholder={t('auth.passwordPlaceholder')}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-all shadow-lg"
          >
            {isRegistering ? t('auth.register') : t('auth.signIn')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
          >
            {isRegistering ? t('auth.hasAccount') : t('auth.noAccount')}
          </button>
        </div>

        <div className="relative my-8 text-center">
          <hr className="border-slate-100 dark:border-slate-700" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 px-4 text-xs font-bold text-slate-300 uppercase tracking-widest">
            {t('common.or')}
          </span>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 border border-slate-200 dark:border-slate-700 py-3 rounded-xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm dark:shadow-none"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            className="w-5 h-5"
            alt="Google"
          />
          {t('auth.continueGoogle')}
        </button>

        <button
          onClick={toggleLocale}
          className="mt-4 w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors py-2"
        >
          <Globe size={14} />
          {locale === 'en' ? 'Español' : 'English'}
        </button>
      </div>
    </div>
  );
}
