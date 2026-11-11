/**
 * RISLY — Runtime: render, splash, shell mounting, routing.
 *
 * Bagian ini adalah inti render aplikasi. Semua fungsi di sini diekspor agar
 * modul lain (dan js/app.js sebagai facade) bisa mengimpor tanpa menciptakan
 * siklus ke js/app.js.
 */

import { store } from '../core/store.js';
import { Cloud } from '../services/cloud.js';
import { APP, ROUTES } from '../core/config.js';
import { loginView } from '../views/auth.js';
import { shellView, updateChrome, updateSyncSlots } from '../views/shell.js';
import { destroyCharts, renderDashboardCharts } from '../services/charts.js';
import { emptyState, closeModal, ui } from '../ui/ui.js';
import { monthKey, debounce } from '../core/utils.js';
import { updateSessionActivity } from '../core/auth.js';
import { ROUTE_VIEWS, routeFromHash } from './router.js';
import { rememberFocus, restoreFocus } from './focus.js';

export const root = document.getElementById('app-root');
let renderTimer = null;
export let lastActivityWrite = 0;

/* -------------------------------------------------------------------------- */
/*  Splash                                                                    */
/* -------------------------------------------------------------------------- */

export function setSplashStatus(text) {
  const node = document.getElementById('splash-status');
  if (node) node.textContent = text;
}

export function hideSplash() {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('is-hidden');
  setTimeout(() => splash.remove(), 450);
}

/* -------------------------------------------------------------------------- */
/*  Render scheduling                                                         */
/* -------------------------------------------------------------------------- */

export function scheduleRender(delay = 60) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    if (store.currentUser && !ui.locked) renderApplication();
    else renderAuth();
  }, delay);
}

/* -------------------------------------------------------------------------- */
/*  Navigasi                                                                  */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Shell mounting                                                            */
/* -------------------------------------------------------------------------- */

function mountShell() {
  const user = store.currentUser;
  if (!root || !user) return;
  root.innerHTML = shellView(user, store.tasksDue(0).length);
  ui.appMounted = true;
  updateSyncSlots(Cloud.getStatus());
}

/* -------------------------------------------------------------------------- */
/*  Main render                                                               */
/* -------------------------------------------------------------------------- */

export function renderApplication({ focus = null } = {}) {
  const user = store.currentUser;
  if (!user || ui.locked) {
    renderAuth();
    return;
  }
  document.body.classList.add('is-app');
  document.body.classList.remove('is-auth');
  if (!ui.appMounted) mountShell();

  const route = routeFromHash();
  ui.route = route;
  const page = document.getElementById('page-content');
  if (!page) {
    mountShell();
    return;
  }

  destroyCharts();
  updateChrome(route);
  const view = ROUTE_VIEWS[route] || ROUTE_VIEWS.dashboard;
  try {
    page.innerHTML = view();
  } catch (error) {
    console.error('Gagal merender halaman:', error);
    page.innerHTML = `<div class="page-stack">${emptyState(
      'alert-triangle',
      'Halaman gagal dimuat',
      'Terjadi kesalahan saat menyiapkan tampilan. Coba muat ulang aplikasi.',
      '<button type="button" class="btn btn-primary btn-sm" data-action="reload-app">Muat ulang</button>',
    )}</div>`;
  }

  page.classList.remove('page-enter');
  requestAnimationFrame(() => page.classList.add('page-enter'));
  document.title = route === 'dashboard'
    ? `${APP.name} · ${APP.fullName}`
    : `${ROUTES[route]?.label || 'Beranda'} · ${APP.name}`;

  updateSyncSlots(Cloud.getStatus());
  restoreFocus(focus);

  if (route === 'dashboard') {
    renderDashboardCharts(monthKey()).catch((error) => console.error(error));
  }
  if (route === 'notes') {
    const search = document.getElementById('notes-search');
    if (search && ui.notesQuery) {
      try { search.setSelectionRange(search.value.length, search.value.length); } catch { /* noop */ }
    }
  }
}

export function renderRouteWithFocus() {
  const snapshot = rememberFocus();
  renderApplication({ focus: snapshot });
}

export const debounceSearch = debounce((callback) => callback(), 280);

export function noteActivity() {
  if (!store.currentUser) return;
  const now = Date.now();
  if (now - lastActivityWrite < 30_000) return;
  lastActivityWrite = now;
  updateSessionActivity();
}

export function renderAuth() {
  if (!root) return;
  destroyCharts();
  ui.appMounted = false;
  document.body.classList.remove('is-app');
  document.body.classList.add('is-auth');
  root.innerHTML = loginView();
  document.title = `${APP.name} · Masuk`;
  updateSyncSlots(Cloud.getStatus());
  hideSplash();
}
