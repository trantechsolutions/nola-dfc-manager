import { Building2, Check, Layers } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import AdminCard from './layout/AdminCard';
import { VIEW_SCOPE } from '../utils/viewScope';

/**
 * ViewScopeCard — lets a club-level admin narrow their own view to team level.
 *
 * Rendered in BOTH Club Settings and Team Settings on purpose: choosing "Team
 * only" hides the club section (and with it the Club Settings page), so the
 * copy in Team Settings is the way back. Dropping either placement strands the
 * admin in the narrowed view until they clear site data.
 */
export default function ViewScopeCard({ viewScope, onChange }) {
  const { t } = useT();
  const current = viewScope === VIEW_SCOPE.CLUB ? VIEW_SCOPE.CLUB : VIEW_SCOPE.TEAM;

  // Team only leads the list because it is the default scope.
  const options = [
    {
      id: VIEW_SCOPE.TEAM,
      icon: Layers,
      label: t('settings.viewScopeTeam', 'Team only'),
      help: t(
        'settings.viewScopeTeamHelp',
        'Hide the club and app-admin sections so only team management is on screen.',
      ),
    },
    {
      id: VIEW_SCOPE.CLUB,
      icon: Building2,
      label: t('settings.viewScopeClub', 'Club + Team'),
      help: t(
        'settings.viewScopeClubHelp',
        'Show the club overview, teams, players, and club settings alongside your team.',
      ),
    },
  ];

  return (
    <AdminCard
      title={t('settings.viewScope', 'View Scope')}
      icon={Layers}
      footer={
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t(
            'settings.viewScopeHelp',
            'Applies to your account on this browser only. Your permissions are unchanged — switch back any time from Team Settings.',
          )}
        </p>
      }
    >
      <div role="radiogroup" aria-label={t('settings.viewScope', 'View Scope')} className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = current === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.id)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted'
              }`}
            >
              <option.icon
                size={16}
                className={`mt-0.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  {option.label}
                  {active && <Check size={13} className="text-emerald-700 dark:text-emerald-400" />}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{option.help}</span>
              </span>
            </button>
          );
        })}
      </div>
    </AdminCard>
  );
}
