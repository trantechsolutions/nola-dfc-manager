import common from './common';
import nav from './nav';
import auth from './auth';
import schedule from './schedule';
import finance from './finance';
import people from './people';
import club from './club';
import evaluations from './evaluations';

export default {
  common,
  nav,
  auth,
  impersonation: schedule.impersonation,
  schedule: schedule.schedule,
  eventTypes: schedule.eventTypes,
  expenses: schedule.expenses,
  settings: schedule.settings,
  ledger: finance.ledger,
  txModal: finance.txModal,
  categories: finance.categories,
  insights: finance.insights,
  catMgr: finance.catMgr,
  accountMgr: finance.accountMgr,
  bulk: finance.bulk,
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
};
