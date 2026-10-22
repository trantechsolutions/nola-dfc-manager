import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clapperboard, ExternalLink, ClipboardList, PlayCircle } from 'lucide-react';
import { filmService, filmLink } from '../services/filmService';
import { useT } from '../i18n/I18nContext';

/**
 * The team's game film site, opened already unlocked with the access this user's place on the team gives:
 * the games for everyone on the team, the coach area for coaches, the scorekeeper screen for the
 * scorekeeper role (assigned in Team Users). Hidden when the team has no film site or the user isn't on it.
 */
export default function GameFilmCard({ teamId }) {
  const { t } = useT();
  const [access, setAccess] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([filmService.getAccess(teamId), filmService.getGames(teamId).catch(() => [])]).then(
      async ([a, games]) => {
        // A scorekeeper or coach also gets a token for their own account, so the stats they keep are theirs.
        const keeperToken = a?.keeper ? await filmService.keeperToken(teamId).catch(() => null) : null;
        // Once games are published into the manager, the film opens in the app itself.
        const inApp = games.some((g) => g.published);
        if (live) setAccess(a || inApp ? { ...a, keeperToken, inApp } : null);
      },
      () => live && setAccess(null),
    );
    return () => {
      live = false;
    };
  }, [teamId]);

  if (!access) return null;
  const film = filmLink(access, 'film');
  const keeper = filmLink(access, 'keeper');

  return (
    <div className="bg-card p-4 rounded-lg border border-border shadow-sm space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center shrink-0">
          <Clapperboard size={18} className="text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{t('common.gameFilm.title')}</p>
          <p className="text-xs text-muted-foreground">
            {access.coach ? t('common.gameFilm.subtitleCoach') : t('common.gameFilm.subtitle')}
          </p>
        </div>
      </div>
      {access.inApp ? (
        <Link
          to={`/film/${teamId}`}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <PlayCircle size={13} />
          {t('common.gameFilm.open')}
        </Link>
      ) : (
        film && (
          <a
            href={film}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <ExternalLink size={13} />
            {access.coach ? t('common.gameFilm.openCoach') : t('common.gameFilm.open')}
          </a>
        )
      )}
      {keeper && (
        <a
          href={keeper}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-card text-foreground hover:bg-background border border-border transition-colors"
        >
          <ClipboardList size={13} />
          {t('common.gameFilm.scorekeeper')}
        </a>
      )}
    </div>
  );
}
