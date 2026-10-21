import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { filmService } from '../services/filmService';
import { useT } from '../i18n/I18nContext';

/**
 * A player's season numbers from the game film (player_season_stats, written by the film's tool):
 * minutes, starts and positions out of the games with time recorded; goals, assists and shots out of the
 * games with named stats. Hidden when there are none for this season, or the viewer may not see them.
 */
export default function PlayerFilmStats({ playerId, seasonId, className = '' }) {
  const { t } = useT();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let live = true;
    filmService.getPlayerStats(playerId, seasonId).then(
      (s) => live && setStats(s),
      () => live && setStats(null),
    );
    return () => {
      live = false;
    };
  }, [playerId, seasonId]);

  if (!stats || (!stats.timedGames && !stats.eventGames)) return null;
  const pct = stats.available ? Math.round((stats.minutes / stats.available) * 100) : null;
  const tiles = [
    stats.timedGames > 0 && {
      label: t('common.filmStats.minutes'),
      value: stats.minutes,
      sub: pct != null ? t('common.filmStats.ofAvailable', { pct }) : null,
    },
    stats.timedGames > 0 && {
      label: t('common.filmStats.starts'),
      value: stats.starts,
      sub: t('common.filmStats.ofGames', { n: stats.timedGames }),
    },
    stats.eventGames > 0 && {
      label: t('common.filmStats.goals'),
      value: stats.goals,
      sub: t('common.filmStats.ofGames', { n: stats.eventGames }),
    },
    stats.eventGames > 0 && { label: t('common.filmStats.assists'), value: stats.assists },
    stats.eventGames > 0 && {
      label: t('common.filmStats.shots'),
      value: stats.shots,
      sub: stats.shots ? t('common.filmStats.onTarget', { n: stats.onTarget }) : null,
    },
  ].filter(Boolean);

  return (
    <div className={`bg-background p-4 rounded-lg border border-border ${className}`}>
      <h4 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
        <BarChart3 size={13} />
        {t('common.filmStats.title')}
        <span className="font-normal">· {t('common.filmStats.games', { n: stats.games })}</span>
      </h4>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-card rounded-lg border border-border p-2 text-center">
            <p className="text-lg font-bold text-foreground leading-tight">{tile.value}</p>
            <p className="text-xs font-semibold text-muted-foreground">{tile.label}</p>
            {tile.sub && <p className="text-xs text-muted-foreground">{tile.sub}</p>}
          </div>
        ))}
      </div>
      {stats.positions?.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="font-semibold">{t('common.filmStats.positions')}:</span>{' '}
          {stats.positions
            .slice(0, 4)
            .map((p) => `${p.pos} ${p.minutes}′`)
            .join(' · ')}
        </p>
      )}
      {(stats.yellow > 0 || stats.red > 0) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('common.filmStats.cards', { y: stats.yellow, r: stats.red })}
        </p>
      )}
    </div>
  );
}
