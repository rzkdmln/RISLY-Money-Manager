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
// Emit terakhir yang datanya sudah tampil di layar. Dipakai untuk membuang
// render susulan yang tidak membawa perubahan apa pun.
let lastRenderedEmitSeq = -1;
// Opsi render yang tertunda (mis. fokus input) saat menunggu commit selesai.
let queuedRenderOptions = null;
// True bila render ditunda karena ada permintaan eksplisit (bukan hanya emit
// store). Render seperti ini tetap dijalankan walau data tidak berubah.
let renderRequested = false;
// Saat proses transisi (mis. login + sinkronisasi awal) berlangsung, render
// ditahan dulu agar aplikasi hanya digambar sekali setelah data siap.
let renderHoldCount = 0;

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
    // Jangan render saat masih ada commit yang menyimpan data atau proses
    // transisi berjalan: tunggu sebentar lalu coba lagi agar hanya terjadi
    // satu render dengan data final.
    if (store.hasPendingWrites || renderHoldCount > 0) {
      scheduleRender(20);
      return;
    }
    // Render untuk emit ini sudah dilakukan (mis. pemanggil langsung
    // renderApplication setelah await commit) → tidak perlu render ulang.
    if (!renderRequested && lastRenderedEmitSeq === store.emitSeq) {
      queuedRenderOptions = null;
      return;
    }
    const options = queuedRenderOptions || {};
    queuedRenderOptions = null;
    renderRequested = false;
    if (store.currentUser && !ui.locked) renderApplicationNow(options);
    else renderAuth();
  }, delay);
}

/**
 * Tahan render sementara (mis. selama login + sinkronisasi awal).
 * Mengembalikan fungsi untuk melepas tahanan. Aman dipanggil berkali-kali.
 */
export function holdRenders() {
  renderHoldCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    renderHoldCount = Math.max(0, renderHoldCount - 1);
    if (renderHoldCount === 0 && renderRequested) scheduleRender(0);
  };
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

export function renderApplication(options = {}) {
  // Ada commit yang belum selesai: tunda render. Bila dipaksa render sekarang,
  // UI akan menampilkan data lama lalu di-render ulang setelah commit selesai
  // (inilah yang terlihat sebagai "load/refresh dua kali").
  if (store.hasPendingWrites || renderHoldCount > 0) {
    if (options?.focus) queuedRenderOptions = options;
    renderRequested = true;
    scheduleRender(0);
    return;
  }
  renderRequested = false;
  queuedRenderOptions = null;
  renderApplicationNow(options);
}

function renderApplicationNow({ focus = null } = {}) {
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
  lastRenderedEmitSeq = store.emitSeq;

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
  // Perbarui sesi pada setiap interaksi agar kunci otomatis tidak aktif
  // saat pengguna masih aktif memakai aplikasi.
  lastActivityWrite = Date.now();
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
  lastRenderedEmitSeq = store.emitSeq;
  hideSplash();
}
