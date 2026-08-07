// Catch-all route element. Deliberately NOT a redirect: bouncing unmatched
// paths to /dashboard with `replace` silently destroys the requested URL, so a
// route that is merely gated behind data still loading — or one the user has no
// role for — is indistinguishable from a normal dashboard load. Rendering a
// real dead end keeps the address bar intact and makes the cause visible.

import { useLocation, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

export default function RouteNotFound() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <Compass className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-bold text-foreground">{t('notFound.title', 'Page not available')}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            'notFound.body',
            "This page doesn't exist, or your current role doesn't have access to it. If you just switched teams or scopes, try selecting a different team.",
          )}
        </p>
        <p className="font-mono text-xs text-muted-foreground/70 break-all">{pathname}</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t('notFound.backToDashboard', 'Back to dashboard')}
        </button>
      </div>
    </div>
  );
}
