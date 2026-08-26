import common from './common';
import nav from './nav';
import auth from './auth';
import schedule from './schedule';
import finance from './finance';
import people from './people';
import club from './club';
import evaluations from './evaluations';
import checklist from './checklist';
import field from './field';

export default {
  common,
  nav,
  auth,
  notFound: common.notFound,
  impersonation: schedule.impersonation,
  schedule: schedule.schedule,
  eventTypes: schedule.eventTypes,
  expenses: schedule.expenses,
  planCosts: schedule.planCosts,
  bulkExpenses: schedule.bulkExpenses,
  settings: schedule.settings,
  ledger: finance.ledger,
  txModal: finance.txModal,
  refundModal: finance.refundModal,
  paymentModal: finance.paymentModal,
  categories: finance.categories,
  insights: finance.insights,
  catMgr: finance.catMgr,
  accountMgr: finance.accountMgr,
  bulk: finance.bulk,
  bookBalance: finance.bookBalance,
  sponsors: finance.sponsors,
  playerForm: people.playerForm,
  playerModal: people.playerModal,
  parent: people.parent,
  overview: people.overview,
  rosterMgmt: people.rosterMgmt,
  roles: people.roles,
  medical: people.medical,
  clubDash: club.clubDash,
  clubTeams: club.clubTeams,
  toast: club.toast,
  confirm: club.confirm,
  evaluations: evaluations.evaluations,
  checklist: checklist.checklist,
  fieldSchedule: field.fieldSchedule,
};
