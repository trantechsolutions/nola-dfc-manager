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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-card p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-8">
          <svg viewBox="0 0 512 512" className="w-16 h-16 mx-auto mb-4" role="img" aria-label="Cantera">
            <defs>
              <linearGradient id="cnLogin" x1="128" y1="40" x2="384" y2="472" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#D26A4F" />
                <stop offset="1" stopColor="#A5382B" />
              </linearGradient>
            </defs>
            <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#cnLogin)" />
            <path d="M256 117 L384.4 210.3 L335.3 361.2 L176.7 361.2 L127.6 210.3 Z" fill="#FFF6F2" />
            <path d="M256 200 L305.5 235.9 L286.6 294.1 L225.4 294.1 L206.5 235.9 Z" fill="#A5382B" opacity="0.14" />
            <g stroke="#A5382B" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.85">
              <path d="M256 200 L305.5 235.9 L286.6 294.1 L225.4 294.1 L206.5 235.9 Z" />
              <path d="M256 200 L256 117" />
              <path d="M305.5 235.9 L384.4 210.3" />
              <path d="M286.6 294.1 L335.3 361.2" />
              <path d="M225.4 294.1 L176.7 361.2" />
              <path d="M206.5 235.9 L127.6 210.3" />
            </g>
          </svg>
          <h2 className="text-3xl font-bold text-foreground tracking-tight">Cantera</h2>
          <p className="text-muted-foreground font-medium">
            {isRegistering ? t('auth.createAccount') : t('auth.managerPortal')}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 dark:text-red-400 rounded-lg text-xs font-semibold border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-ring transition-all"
              placeholder={t('auth.emailPlaceholder')}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-ring transition-all"
              placeholder={t('auth.passwordPlaceholder')}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-accent text-accent-foreground font-semibold py-3 rounded-lg hover:bg-accent/90 transition-all shadow-lg"
          >
            {isRegistering ? t('auth.register') : t('auth.signIn')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-sm font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 transition-colors"
          >
            {isRegistering ? t('auth.hasAccount') : t('auth.noAccount')}
          </button>
        </div>

        <div className="relative my-8 text-center">
          <hr className="border-border" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-4 text-xs font-semibold text-muted-foreground">
            {t('common.or')}
          </span>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 border border-border py-3 rounded-lg font-semibold text-foreground hover:bg-background transition-all shadow-sm"
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
          className="mt-4 w-full flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          <Globe size={14} />
          {locale === 'en' ? 'Español' : 'English'}
        </button>
      </div>
    </div>
  );
}
