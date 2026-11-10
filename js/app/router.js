/**
 * RISLY — Router.
 *
 * Pemetaan route ke view, parsing hash dari URL, dan navigasi antar halaman.
 * Diekstrak dari js/app.js (Fase 2) bersama runtime.js.
 *
 * Catatan sengaja: router.js mengimpor renderApplication dari runtime.js
 * agar navigate() dapat memicu render ulang saat hash sama atau pakai
 * history.replaceState. Siklus runtime ↔ router aman karena
 * renderApplication hanya dipanggil saat fungsi dieksekusi (saat runtime
 * sudah siap), bukan saat evaluasi modul.
 */

import { store } from '../store.js';
import { closeModal, ui } from '../ui.js';
import { ROUTES } from '../config.js';
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
import { renderApplication } from './runtime.js';

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

export function navigate(route, { replace = false } = {}) {
  if (!ROUTES[route]) return;
  if (route === 'accounts') ui.accountsMember = null;
  closeModal({ silent: true });
  const target = `#/${route}`;
  if (location.hash === target) {
    renderApplication();
    return;
  }
  if (replace) {
    history.replaceState(null, '', target);
    renderApplication();
  } else {
    location.hash = target;
  }
}
