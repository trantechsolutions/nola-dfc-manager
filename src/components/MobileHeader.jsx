import { Globe, LogOut, Menu } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { isSingleTeamMode } from '../utils/singleTeamMode';

export default function MobileHeader({
  club,
  selectedTeam,
  teams,
  selectedTeamId,
  setSelectedTeamId,
  toggleLocale,
  locale,
  cycleTheme,
  theme,
  ThemeIcon,
  mobileMenuOpen,
  setMobileMenuOpen,
  supabase,
}) {
  const { t } = useT();
  const singleTeam = isSingleTeamMode();

  return (
    <header className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 sticky top-0 z-40">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="text-slate-600 dark:text-slate-300"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div>
            <h1 className="font-black text-slate-900 dark:text-white text-sm">{club?.name || 'Team Manager'}</h1>
            {selectedTeam && <p className="text-[10px] font-bold text-blue-600">{selectedTeam.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!singleTeam && teams.length > 1 && (
            <select
              value={selectedTeamId || ''}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg border-none px-2 py-1 max-w-[120px]"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={toggleLocale}
            className="relative text-slate-500 dark:text-slate-400"
            title={locale === 'en' ? 'Español' : 'English'}
            aria-label="Toggle language"
          >
            <Globe size={16} />
            <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[7px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center uppercase">
              {locale}
            </span>
          </button>
          <button
            onClick={cycleTheme}
            className="text-slate-500 dark:text-slate-400"
            title={`Theme: ${theme}`}
            aria-label="Toggle theme"
          >
            <ThemeIcon size={16} />
          </button>
          <button onClick={() => supabase.auth.signOut()} className="text-red-500" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
