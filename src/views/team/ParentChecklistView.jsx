import { ListChecks } from 'lucide-react';
import { useT } from '../../i18n/I18nContext';
import PlayerChecklistCard from '../../components/PlayerChecklistCard';

/**
 * ParentChecklistView — the parent's own route for the season checklist.
 *
 * Previously this lived inside My Player → Paperwork, which buried the one
 * surface parents are asked to act on. It is its own nav entry now; the card
 * itself is unchanged and still owns all the loading and saving.
 *
 * A guardian can have more than one player on the roster, and each has a
 * separate set of responses — so this renders one card per player rather than
 * a picker, which would hide half the outstanding work behind a click.
 */
export default function ParentChecklistView({
  players = [],
  selectedSeason,
  clubId,
  user,
  showToast,
  onRefresh,
  isReadOnly = false,
}) {
  const { t } = useT();

  if (players.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <ListChecks size={28} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-bold text-foreground">{t('parent.noPlayers')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('parent.noPlayersMsg')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {players.map((player) => (
        <section key={player.id} className="space-y-2">
          {/* The name only earns a heading when there is more than one card to
              tell apart; a lone player already has it on the page header. */}
          {players.length > 1 && (
            <h2 className="text-sm font-bold text-foreground">
              {player.firstName} {player.lastName}
            </h2>
          )}
          <PlayerChecklistCard
            player={player}
            teamId={player.teamId}
            seasonId={selectedSeason}
            clubId={clubId}
            user={user}
            showToast={showToast}
            onRefresh={onRefresh}
            isReadOnly={isReadOnly}
          />
        </section>
      ))}
    </div>
  );
}
