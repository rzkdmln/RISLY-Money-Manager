/**
 * RISLY — Router.
 *
 * Pemetaan route ke view dan parsing hash dari URL.
 * Diekstrak dari js/app.js (Fase 2) bersama runtime.js.
 *
 * router.js sengaja tidak mengimpor runtime.js agar tidak terdapat
 * siklus import. Navigasi yang memicu render ulang (navigate) tetap
 * di runtime.js di mana renderApplication didefinisikan.
 */

import { store } from '../core/store.js';
import { closeModal, ui } from '../ui/ui.js';
import { ROUTES } from '../core/config.js';
import { dashboardView } from '../views/dashboard.js';
import { transactionsView } from '../views/transactions.js';
import { calendarView } from '../views/calendar.js';
import { notesView } from '../views/notes.js';
import { accountsView } from '../views/accounts.js';
import { budgetsView } from '../views/budgets.js';
import { recurringView } from '../views/recurring.js';
import { categoriesView } from '../views/categories.js';
import { goalsView } from '../views/goals.js';
import { reportsView } from '../views/reports.js';
import { settingsView } from '../views/settings.js';

export const ROUTE_VIEWS = {
  dashboard: () => dashboardView(store.currentUser),
  transactions: () => transactionsView(),
  calendar: () => calendarView(),
  notes: () => notesView(),
  accounts: () => accountsView(),
  budgets: () => budgetsView(),
  recurring: () => recurringView(),
  categories: () => categoriesView(),
  goals: () => goalsView(),
  reports: () => reportsView(),
  settings: () => settingsView(store.currentUser),
};

export function routeFromHash() {
  const raw = String(location.hash || '')
    .replace(/^#\/?/, '')
    .split('?')[0]
    .trim()
    .toLowerCase();
  return ROUTES[raw] ? raw : 'dashboard';
}
