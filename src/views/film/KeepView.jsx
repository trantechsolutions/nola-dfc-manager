import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { useT } from '../../i18n/I18nContext';
import { KeepApp } from '../../film/pages/Keep';
import '../../film/keeper.css';

/**
 * The scorekeeper for a team (/keep/:teamId/…), carried over from the game film site. It fills the screen over
 * the app, since it's held sideways at the field and needs every pixel. Open to the team's coaches, manager,
 * club admins and scorekeepers (keeper_can_keep, sql/keeper_native_migration.sql).
 */
export default function KeepView() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const [state, setState] = useState({ status: 'checking', teamName: '' });

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.rpc('keeper_can_keep', { p_team_id: teamId }),
      supabase.from('teams').select('name').eq('id', teamId).maybeSingle(),
    ]).then(
      ([can, team]) => {
        if (!live) return;
        setState({ status: can.data === true ? 'ok' : 'denied', teamName: team.data?.name || '' });
      },
      () => live && setState({ status: 'denied', teamName: '' }),
    );
    return () => {
      live = false;
    };
  }, [teamId]);

  // The page underneath doesn't scroll while the scorekeeper is open.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  // Back where it was opened from (the schedule or the Stats page, passed as location state by the links in);
  // opened any other way, the Stats page.
  const location = useLocation();
  const [from] = useState(() => {
    const path = location.state?.from;
    return typeof path === 'string' && path.startsWith('/') && !path.startsWith('/keep/') ? path : null;
  });
  // Where the scorekeeper's first screen sits in the browser history (React Router keeps `idx` there). Leaving
  // steps back past every screen it added, so the phone's back button afterwards doesn't land inside it again.
  const [startIdx] = useState(() => window.history.state?.idx);
  const leave = () => {
    const idx = window.history.state?.idx;
    if (from && Number.isInteger(startIdx) && Number.isInteger(idx) && idx >= startIdx && startIdx > 0) {
      navigate(-(idx - startIdx + 1));
    } else {
      navigate(from || `/film/${teamId}`, { replace: true });
    }
  };
  const place = !from
    ? 'stats'
    : from.startsWith('/schedule')
      ? 'schedule'
      : from.startsWith('/film/')
        ? 'stats'
        : 'app';
  const backLabel = t('film.kp_backTo', { place: t(`film.kp_place_${place}`) });

  return (
    <div className="film-keep kp-enter fixed inset-0 z-[2000] overflow-y-auto">
      {state.status === 'checking' && (
        <div className="flex min-h-full items-center justify-center">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {state.status === 'denied' && (
        <div className="status wrap kp-wrap" role="alert">
          <p>{t('film.kp_notAllowed')}</p>
          <button type="button" className="btn-line" onClick={leave}>
            ‹ {backLabel}
          </button>
        </div>
      )}
      {state.status === 'ok' && (
        <KeepApp teamId={teamId} teamName={state.teamName} onLeave={leave} backLabel={backLabel} />
      )}
    </div>
  );
}
