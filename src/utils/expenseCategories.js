// Category and template data for the schedule-side expense forms. Lives outside
// the modals so the per-event form and the bulk-add form can't drift apart on
// which categories are offered or what a template is called.

/** Categories the event expense forms offer. Display labels cover more (see below). */
export const EXPENSE_CATEGORIES = ['OPE', 'TOU', 'LEA', 'FRI'];

/** Labels for every transaction category, not just the four offered above — an
 *  expense filed elsewhere in the ledger still has to render here. */
export function getCategoryLabels(t) {
  return {
    TOU: t('categories.tournament'),
    LEA: t('categories.leagueRefs'),
    OPE: t('categories.operating'),
    FRI: t('categories.friendlies'),
    TMF: t('categories.teamFees'),
    FUN: t('categories.fundraising'),
    SPO: t('categories.sponsorship'),
    CRE: t('categories.credit'),
  };
}

/** Quick-add suggestions per event type. */
export function getExpenseTemplates(t) {
  return {
    league: [
      { title: t('expenses.refereeFees'), category: 'LEA' },
      { title: t('expenses.leagueFees'), category: 'LEA' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
    tournament: [
      { title: t('expenses.tournamentReg'), category: 'TOU' },
      { title: t('expenses.checkInFees'), category: 'TOU' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
    friendly: [
      { title: t('expenses.refereeFees'), category: 'OPE' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
    practice: [
      { title: t('expenses.fieldRental'), category: 'OPE' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
    event: [
      { title: t('expenses.eventFees'), category: 'OPE' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
  };
}
