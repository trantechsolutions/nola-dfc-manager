// A club you play, and every game against it.
//
// The contact directory used to be a separate panel above a flat list of games,
// which meant the person you call to move a game and the game you are moving
// sat in two different places. They are one card now: club name and contact
// details in the header, that club's fixtures underneath, and a button that
// schedules the next one already pointed at them.
//
// The header is deliberately loud — coloured initials tile, an edge stripe in
// the same colour, a tinted band — because a page of these is read by scanning
// for one club, and a stack of identical white rectangles gives the eye nothing
// to land on. The games sit on a recessed body so they read as contents of the
// card rather than more cards.
//
// A card can exist without a contact row behind it — an opponent name typed on
// a game the directory has never seen — and it says so, with one click to save
// it. Renaming a club renames its games too, because the club name is the only
// thing tying the two together (see utils/opponentCards).

import { useState } from 'react';
import { CalendarPlus, ChevronDown, ChevronUp, Mail, Phone, Trash2, UserPlus, HelpCircle } from 'lucide-react';
import MatchupRow from './MatchupRow';
import { clubAccent, clubInitials } from '../utils/opponentCards';
import { useT } from '../i18n/I18nContext';

const ContactDetails = ({ contact, canEdit, onUpdate, t }) => {
  const commit = (field, value) => {
    if ((contact[field] || '') === value) return;
    onUpdate(contact.id, { [field]: value });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        defaultValue={contact.contactName || ''}
        disabled={!canEdit}
        placeholder={t('schedule.contactNamePlaceholder')}
        onBlur={(e) => commit('contactName', e.target.value)}
        className="min-w-[8rem] flex-1 px-2 py-1 text-sm bg-card border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />

      <div className="flex items-center gap-1.5 min-w-[9rem] flex-1">
        <Phone size={13} className="text-muted-foreground shrink-0" />
        <input
          type="tel"
          defaultValue={contact.phone || ''}
          disabled={!canEdit}
          placeholder={t('schedule.phonePlaceholder')}
          onBlur={(e) => commit('phone', e.target.value)}
          className="w-full px-2 py-1 text-sm bg-card border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        />
      </div>

      <div className="flex items-center gap-1.5 min-w-[11rem] flex-1">
        <Mail size={13} className="text-muted-foreground shrink-0" />
        <input
          type="email"
          defaultValue={contact.email || ''}
          disabled={!canEdit}
          placeholder={t('schedule.emailPlaceholder')}
          onBlur={(e) => commit('email', e.target.value)}
          className="w-full px-2 py-1 text-sm bg-card border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        />
      </div>

      <input
        type="text"
        defaultValue={contact.notes || ''}
        disabled={!canEdit}
        placeholder={t('schedule.contactNotesPlaceholder')}
        onBlur={(e) => commit('notes', e.target.value)}
        className="min-w-[10rem] flex-[2] px-2 py-1 text-sm bg-card border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />
    </div>
  );
};

export default function OpponentTeamCard({
  card,
  canEdit = false,
  blackoutDates = new Set(),
  onScheduleGame,
  onRenameClub,
  onSaveContact,
  onUpdateContact,
  onDeleteContact,
  onUpdateMatchup,
  onSetMatchupStatus,
  onConfirmMatchup,
  onRescheduleMatchup,
  onDuplicateMatchup,
  onDeleteMatchup,
  costs = [],
  showCosts = false,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
  onSendCostToLedger,
  isCostBudgeted,
  ledgerTxById = {},
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(true);
  const { contact, clubName, matchups, isUnassigned, unsaved } = card;
  const accent = isUnassigned ? clubAccent(null) : clubAccent(card.key);

  return (
    <div
      className={`relative bg-card rounded-xl border shadow-sm overflow-hidden ${
        isUnassigned ? 'border-dashed border-border' : 'border-border'
      }`}
    >
      {/* The card's colour, carried down its full height so the boundary
          between one club and the next is never in doubt. */}
      <div className={`absolute inset-y-0 left-0 w-1 ${accent.edge}`} aria-hidden="true" />

      <div className="pl-4 pr-3 py-3 space-y-2 bg-muted/40 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold uppercase tracking-tight ${accent.tile}`}
            aria-hidden="true"
          >
            {isUnassigned ? <HelpCircle size={16} /> : clubInitials(clubName)}
          </span>

          {isUnassigned ? (
            <span className="min-w-[9rem] flex-1 text-base font-bold italic text-muted-foreground">
              {t('schedule.unassignedTeam')}
            </span>
          ) : (
            <input
              type="text"
              defaultValue={clubName}
              disabled={!canEdit}
              placeholder={t('schedule.clubNamePlaceholder')}
              aria-label={t('schedule.clubNamePlaceholder')}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (!next || next === clubName) {
                  e.target.value = clubName;
                  return;
                }
                onRenameClub(card, next);
              }}
              className="min-w-[9rem] flex-1 px-2 py-1 text-base font-bold tracking-tight bg-transparent border border-transparent rounded outline-none hover:border-border focus:border-ring focus:bg-card focus:ring-1 focus:ring-ring disabled:opacity-60"
            />
          )}

          <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground shrink-0">
            {t('schedule.gameCount', { n: matchups.length })}
          </span>

          {unsaved && (
            <span
              title={t('schedule.saveContactHint')}
              className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 shrink-0"
            >
              {t('schedule.unsavedTeam')}
            </span>
          )}

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {canEdit && !isUnassigned && (
              <button
                type="button"
                onClick={() => onScheduleGame(card)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <CalendarPlus size={14} /> {t('schedule.scheduleGame')}
              </button>
            )}

            {canEdit && unsaved && (
              <button
                type="button"
                onClick={() => onSaveContact(card)}
                title={t('schedule.saveContactHint')}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-ring transition-colors"
              >
                <UserPlus size={14} /> {t('schedule.saveContact')}
              </button>
            )}

            {canEdit && contact && (
              <button
                type="button"
                onClick={() => onDeleteContact(contact.id)}
                title={t('schedule.removeTeamHint')}
                className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400"
              >
                <Trash2 size={15} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title={t('schedule.toggleGames')}
              aria-expanded={expanded}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {contact && <ContactDetails contact={contact} canEdit={canEdit} onUpdate={onUpdateContact} t={t} />}
      </div>

      {expanded && (
        <div className="pl-4 pr-3 py-3 space-y-2 bg-background/60">
          {matchups.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center text-muted-foreground font-semibold italic text-sm">
              {t('schedule.noGamesForTeam')}
            </div>
          ) : (
            matchups.map((matchup) => (
              <MatchupRow
                key={matchup.id}
                matchup={matchup}
                canEdit={canEdit}
                showOpponentField={!!isUnassigned}
                isBlackedOut={!!matchup.matchDate && blackoutDates.has(matchup.matchDate)}
                onUpdate={onUpdateMatchup}
                onSetStatus={onSetMatchupStatus}
                onConfirm={onConfirmMatchup}
                onReschedule={onRescheduleMatchup}
                onDuplicate={onDuplicateMatchup}
                onDelete={onDeleteMatchup}
                costs={costs}
                showCosts={showCosts}
                onAddCost={onAddCost}
                onUpdateCost={onUpdateCost}
                onDeleteCost={onDeleteCost}
                onSendCostToLedger={onSendCostToLedger}
                isCostBudgeted={isCostBudgeted}
                ledgerTxById={ledgerTxById}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
