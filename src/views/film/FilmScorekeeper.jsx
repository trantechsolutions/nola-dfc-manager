import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Dumbbell } from 'lucide-react';
import { useFilmText } from '../../film/FilmContext';
import { filmService } from '../../services/filmService';

/**
 * The foot of the Stats page, for the team's stat keepers only (keeper_can_keep): a practice run, and the
 * scorekeeper itself to see and resume the games on this phone. Real games are kept from the schedule, inside
 * each game's window. Everyone else sees nothing here.
 */
export default function FilmScorekeeper({ teamId }) {
  const { t } = useFilmText();
  const [canKeep, setCanKeep] = useState(false);

  useEffect(() => {
    let live = true;
    setCanKeep(false);
    filmService.canKeep(teamId).then(
      (v) => live && setCanKeep(!!v),
      () => live && setCanKeep(false),
    );
    return () => {
      live = false;
    };
  }, [teamId]);

  if (!canKeep) return null;

  return (
    <section aria-labelledby="film-keeper" className="space-y-3 border-t border-border pt-5">
      <div className="space-y-1">
        <h2 id="film-keeper" className="text-base font-semibold text-foreground">
          {t('keeper_title')}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">{t('keeper_help')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/keep/${teamId}/practice`}
          state={{ from: `/film/${teamId}` }}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Dumbbell size={15} aria-hidden="true" />
          {t('keeper_practice')}
        </Link>
        <Link
          to={`/keep/${teamId}`}
          state={{ from: `/film/${teamId}` }}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <ClipboardList size={15} aria-hidden="true" />
          {t('keeper_open')}
        </Link>
      </div>
    </section>
  );
}
