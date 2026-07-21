import { Globe, LogOut, Menu } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { useNavigation } from '../context/NavigationContext';

export default function MobileHeader() {
  const {
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
    setMobileMenuOpen,
    supabase,
    singleTeam,
  } = useNavigation();
  const { t } = useT();

  return (
    <header className="md:hidden bg-card border-b border-border p-4 sticky top-0 z-40">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => setMobileMenuOpen(true)} className="text-foreground" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div>
            <h1 className="font-bold text-foreground text-sm">{club?.name || 'Touchline'}</h1>
            {selectedTeam && (
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">{selectedTeam.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!singleTeam && teams.length > 1 && (
            <select
              value={selectedTeamId || ''}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="text-xs font-semibold text-foreground bg-background rounded-lg border-none px-2 py-1 max-w-[120px]"
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
            className="relative text-muted-foreground"
            title={locale === 'en' ? 'Español' : 'English'}
            aria-label="Toggle language"
          >
            <Globe size={16} />
            <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-xs font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center uppercase">
              {locale}
            </span>
          </button>
          <button
            onClick={cycleTheme}
            className="text-muted-foreground"
            title={`Theme: ${theme}`}
            aria-label="Toggle theme"
          >
            <ThemeIcon size={16} />
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-red-700 dark:text-red-400"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
