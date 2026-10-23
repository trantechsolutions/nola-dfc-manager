import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

  // Back where it was opened from (the schedule or the Stats page); a fresh tab lands on the Stats page.
  const leave = () => (window.history.length > 1 ? navigate(-1) : navigate(`/film/${teamId}`));

  return (
    <div className="film-keep fixed inset-0 z-[2000] overflow-y-auto">
      {state.status === 'checking' && (
        <div className="flex min-h-full items-center justify-center">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {state.status === 'denied' && (
        <div className="status wrap kp-wrap" role="alert">
          <p>{t('film.kp_notAllowed')}</p>
          <button type="button" className="btn-line" onClick={leave}>
            {t('film.kp_leave')}
          </button>
        </div>
      )}
      {state.status === 'ok' && <KeepApp teamId={teamId} teamName={state.teamName} onLeave={leave} />}
    </div>
  );
}
