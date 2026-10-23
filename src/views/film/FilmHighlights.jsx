import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { filmService } from '../../services/filmService';
import { useFilm, useFilmText } from '../../film/FilmContext';
import { T } from '../../film/RichText';
import { stripMarkup } from '../../film/lib/markup';
import { mmss, sec } from '../../film/lib/time';
import { FilmStatus } from './filmUi';

const TAG_TONE = {
  Goal: 'bg-success text-success-foreground',
  Conceded: 'bg-destructive text-destructive-foreground',
  Card: 'bg-warning text-warning-foreground',
};

/**
 * The game's highlight clips. They stream from a private bucket through links the film-clip function signs
 * for an hour; a link that has run out (a tab left open) is fetched again.
 */
export default function FilmHighlights({ game: g }) {
  const { teamId } = useFilm();
  const { t, tx } = useFilmText();
  const [links, setLinks] = useState({ status: 'loading', urls: {}, until: 0 });

  const load = useCallback(() => {
    setLinks((l) => ({ ...l, status: 'loading' }));
    return filmService.getClipLinks(teamId, g.slug).then(
      (r) => setLinks({ status: 'ready', urls: r?.urls || {}, until: Date.now() + (r?.expiresIn ?? 3600) * 1000 }),
      () => setLinks({ status: 'error', urls: {}, until: 0 }),
    );
  }, [teamId, g.slug]);

  useEffect(() => {
    load();
  }, [load]);

  // A video that won't play after its link has expired gets fresh links.
  const onVideoError = () => {
    if (Date.now() > links.until - 60_000) load();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('hlLead', { n: g.highlights.clips.length })}</p>
      {links.status === 'error' && (
        <FilmStatus>
          <p>{t('clipsUnavailable')}</p>
          <button type="button" onClick={load} className="rounded-lg border border-border px-3 py-1.5 font-semibold">
            {t('retry')}
          </button>
        </FilmStatus>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {g.highlights.clips.map((c) => (
          <figure key={c.id} className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="aspect-video bg-black">
              {links.urls[c.id] ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src={links.urls[c.id]}
                  onError={onVideoError}
                  className="h-full w-full"
                  aria-label={stripMarkup(tx(c.label))}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-white/70">
                  {links.status === 'loading' ? t('loadingClip') : t('clipsUnavailable')}
                </div>
              )}
            </div>
            <figcaption className="space-y-1 p-3">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn('rounded px-1.5 py-0.5 font-semibold', TAG_TONE[c.tag] ?? 'bg-muted text-foreground')}
                >
                  {t(`tag_${c.tag}`)}
                </span>
                <span>{t('fullVideo', { from: c.start, to: c.end })}</span>
                <span className="tabular-nums">{mmss(sec(c.end) - sec(c.start))}</span>
              </p>
              <p className="text-sm font-medium text-foreground">
                <T t={c.label} />
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
