/**
 * RISLY Money Manager — application bootstrap, router, controller and exports.
 *
 * The app is intentionally framework-free: views are pure template functions,
 * the store owns all mutations, and this module wires user intents to it.
 */

import {
  APP,
  CLOUD_PROVIDERS,
  FREQUENCIES,
  LOCK_OPTIONS,
  ROUTES,
  THEME_OPTIONS,
  TX_TYPES,
  WEEK_OPTIONS,
} from './config.js';
import { store } from './store.js';
import { Cloud } from './cloud.js';
import { GoogleDrive, googleAccountBadge } from './gdrive.js';
import {
  clearGoogleAuthRedirectPending,
  clearPendingGoogleLogin,
  completeGoogleAuthLogin,
  hasPendingGoogleAuthRedirect,
  startGoogleAuthRedirect,
  startGoogleAuthPopup,
  warmUpGoogleAuth,
} from './google-auth-relay.js';
import { initPullToRefresh } from './pull-to-refresh.js';
import {
  changePin,
  clearSession,
  createPinCredentials,
  createSession,
  getLockRemaining,
  getSession,
  isSessionExpired,
  registerFailedAttempt,
  resetFailedAttempts,
  updateSessionActivity,
  verifyPin,
} from './auth.js';
import { destroyCharts, renderDashboardCharts, resizeCharts } from './charts.js';
import { harmonySwatchMarkup } from './colors.js';
import { icon } from './icons.js';
import {
  applyTheme,
  closeModal,
  confirmDialog,
  emptyState,
  money,
  openModal,
  prefs,
  savePrefs,
  setTheme,
  toast,
  togglePrivacy,
  ui,
} from './ui.js';
import {
  addDaysISO,
  advanceDate,
  currentTimeHHMM,
  debounce,
  downloadBlob,
  downloadJSON,
  escapeAttr,
  escapeHTML,
  expressionResult,
  fileSafe,
  formatAmountExpression,
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateDMY,
  formatDateTime,
  formatMonth,
  getInitials,
  isIos,
  isStandalone,
  localDateISO,
  monthKey,
  normalizeSearch,
  normalizeTime,
  nowISO,
  parseDateDMY,
  parseDateTimeLocal,
  readFileAsText,
  sanitizeNoteHTML,
  safeNumber,
  shiftMonthKey,
  todayISO,
  toDateTimeLocal,
} from './utils.js';

import { dashboardView } from './views/dashboard.js';
import { transactionsView, dayDetailView, transactionFilterModal } from './views/transactions.js';
import { calendarView } from './views/calendar.js';
import { notesView, tasksSheet } from './views/notes.js';
import { accountsView } from './views/accounts.js';
import { budgetsView, budgetCategoriesModal } from './views/budgets.js';
import { recurringView } from './views/recurring.js';
import { categoriesView } from './views/categories.js';
import { goalsView, goalForm } from './views/goals.js';
import { reportsView } from './views/reports.js';
import { settingsView } from './views/settings.js';
import { loginView } from './views/auth.js';
import {
  moreSheet,
  profileSheet,
  shellView,
  updateChrome,
  updateSyncSlots,
} from './views/shell.js';

import {
  accountForm,
  categoryForm,
  changePinForm,
  profileForm,
  subcategoryForm,
} from './forms/account.js';
import {
  accountOptions,
  recurringForm,
  subcategoryOptions,
  transactionForm,
} from './forms/transaction.js';
import { noteEditorForm, todoItemRow } from './forms/note.js';
import { cloudProviderFields } from './forms/cloud.js';
import {
  openImportFilePicker,
  openImportFormModal,
  downloadImportTemplate,
  submitImport,
  typeLabel,
} from './import.js';
import {
  openExportModal,
  exportExcel,
  exportExcelRange,
  exportPdf,
  exportPdfRange,
} from './export.js';
import {
  backupNow,
  pickBackupFile,
  resetApplication,
  driveFileStamp,
  refreshDriveUi,
  ensureDriveAccess,
  driveBackupNow,
  openDriveRestoreModal,
  driveRestoreFile,
} from './backup.js';

/* -------------------------------------------------------------------------- */
/*  Runtime state                                                            */
/* -------------------------------------------------------------------------- */

const root = document.getElementById('app-root');
let renderTimer = null;
let noteSaveTimer = null;
let deferredInstallPrompt = null;
let swRegistration = null;
let lastActivityWrite = 0;
let lastReminderCheck = 0;
let suppressRender = false;

const ROUTE_VIEWS = {
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

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                            */
/* -------------------------------------------------------------------------- */

function routeFromHash() {
  const raw = String(location.hash || '')
    .replace(/^#\/?/, '')
    .split('?')[0]
    .trim()
    .toLowerCase();
  return ROUTES[raw] ? raw : 'dashboard';
}

function navigate(route, { replace = false } = {}) {
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

function showFormError(form, message) {
  const node = form?.querySelector('[data-form-error]');
  if (!node) {
    toast(message, 'error');
    return;
  }
  node.textContent = message;
  node.classList.remove('hidden');
  node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function clearFormError(form) {
  const node = form?.querySelector('[data-form-error]');
  if (node) {
    node.textContent = '';
    node.classList.add('hidden');
  }
}

function sameColor(first, second) {
  return String(first || '').toLowerCase() === String(second || '').toLowerCase();
}

function applyColorFieldValue(field, color) {
  if (!field || !color) return;
  const hidden = field.querySelector('input[name="color"]');
  if (hidden) hidden.value = color;
  const chip = field.querySelector('.color-trigger-chip');
  if (chip) chip.style.setProperty('--pick-color', color);
  const label = field.querySelector('[data-color-label]');
  if (label) label.textContent = color;
  field.querySelectorAll('.color-swatch, .color-dot').forEach((dot) => {
    dot.classList.toggle('is-active', sameColor(dot.dataset.color, color));
  });
  const preview = field.closest('form')?.querySelector('.category-preview');
  if (preview) preview.style.setProperty('--preview-color', color);
}

function refreshColorField(field) {
  if (!field) return;
  const custom = field.querySelector('[data-color-custom]');
  const hidden = field.querySelector('input[name="color"]');
  const base = field.dataset.colorBase || custom?.value || hidden?.value || '#3B82F6';
  const selected = hidden?.value || base;
  const mode = field.dataset.colorHarmony || 'analogous';
  const swatches = field.querySelector('[data-color-swatches]');
  if (swatches) swatches.innerHTML = harmonySwatchMarkup(base, mode, selected);
  applyColorFieldValue(field, selected);
}

function setColorFieldBase(field, color) {
  if (!field || !color) return;
  field.dataset.colorBase = color;
  const custom = field.querySelector('[data-color-custom]');
  if (custom && !sameColor(custom.value, color)) custom.value = color;
  const hidden = field.querySelector('input[name="color"]');
  if (hidden) hidden.value = color;
  refreshColorField(field);
}

function formValue(form, name) {
  return new FormData(form).get(name);
}

function stringValue(form, name) {
  return String(formValue(form, name) ?? '').trim();
}

function rememberFocus() {
  const active = document.activeElement;
  if (!active?.id) return null;
  return {
    id: active.id,
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
  };
}

function restoreFocus(snapshot) {
  if (!snapshot?.id) return;
  const node = document.getElementById(snapshot.id);
  if (!node) return;
  node.focus({ preventScroll: true });
  if (snapshot.start !== null && typeof node.setSelectionRange === 'function') {
    try {
      node.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
    } catch { /* not a text field */ }
  }
}

function setSplashStatus(text) {
  const node = document.getElementById('splash-status');
  if (node) node.textContent = text;
}

function hideSplash() {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('is-hidden');
  setTimeout(() => splash.remove(), 450);
}

function scheduleRender(delay = 60) {
  if (suppressRender) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    if (store.currentUser && !ui.locked) renderApplication();
    else renderAuth();
  }, delay);
}

function mountShell() {
  const user = store.currentUser;
  if (!root || !user) return;
  root.innerHTML = shellView(user, store.tasksDue(0).length);
  ui.appMounted = true;
  updateSyncSlots(Cloud.getStatus());
}

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
    ? `${APP.name} · ${APP.fullLabel || APP.fullName}`
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

function renderRouteWithFocus() {
  const snapshot = rememberFocus();
  renderApplication({ focus: snapshot });
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

/* -------------------------------------------------------------------------- */
/*  Session & recurring automation                                           */
/* -------------------------------------------------------------------------- */

export function enterApplication(user, { fresh = false } = {}) {
  store.setCurrentUser(user.id);
  ui.currentUser = user;
  ui.selectedUser = user.id;
  ui.locked = false;
  ui.appMounted = false;
  savePrefs({ lastUser: user.id });
  createSession(user.id, store.workspaceId);
  if (!location.hash || !ROUTES[String(location.hash).replace(/^#\//, '')]) {
    try { history.replaceState(null, '', '#/dashboard'); } catch { /* noop */ }
  }
  renderApplication();
  if (fresh) toast(`Selamat datang, ${user.name}.`, 'success');
  runRecurring({ notify: true });
  try { store.recordNetWorthSnapshot(); } catch { /* ignore */ }
  setTimeout(checkReminders, 1_200);
  // Cloud sync (Firebase) runs through the CloudSync engine. Setelah login,
  // pastikan koneksi benar-benar dibuat lalu tarik data terbaru — jangan
  // menunggu pengguna menekan ikon cloud.
  if (store.workspaceId) {
    void syncCloudAfterLogin();
  }
}

async function syncCloudAfterLogin() {
  try {
    const status = Cloud.getStatus();
    if (status.provider === 'local') return null;
    if (!status.connected) {
      const bootstrapped = await Cloud.bootstrap({ waitForAuth: true });
      if (bootstrapped?.local || bootstrapped?.skipped) return bootstrapped;
    }
    if (!Cloud.canSync()) return null;
    return await Cloud.syncNow({ silent: true });
  } catch (error) {
    console.warn('Sinkronisasi otomatis setelah login gagal:', error);
    return null;
  }
}

/**
 * Google sign-in untuk installed iOS PWAs.
 *
 * Jalur login memakai Firebase Auth redirect (startGoogleAuthRedirect +
 * completeGoogleAuthLogin) agar hasilnya kembali ke aplikasi ini secara
 * langsung, tanpa relay publik. Must be called directly from the click so iOS
 * allows the redirect navigation.
 */
function showGoogleWaitingModal({ onCancel }) {
  let done = false;
  const finish = (callback) => {
    if (done) return;
    done = true;
    callback?.();
  };
  openModal({
    size: 'sm',
    onClose: () => finish(onCancel),
    html: `<div class="p-5 sm:p-6 text-center">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
        ${icon('smartphone', 'w-6 h-6')}
      </span>
      <h2 class="mt-4 text-[17px] font-bold text-slate-900 dark:text-white">Menyelesaikan masuk</h2>
      <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Buka halaman Google untuk masuk dengan akun Anda, lalu kembali ke aplikasi ini.
        Proses akan selesai otomatis.
      </p>
      <button type="button" class="btn btn-secondary mt-5 w-full" data-google-cancel>Batalkan</button>
    </div>`,
  });
  document.querySelector('[data-google-cancel]')?.addEventListener('click', () => {
    finish(onCancel);
    closeModal({ silent: true });
  });
  return {
    close() {
      finish(null);
      closeModal({ silent: true });
    },
  };
}

function canFallbackToRedirect(error) {
  const code = String(error?.code || '');
  return code === 'auth/popup-blocked'
    || code === 'auth/operation-not-supported-in-this-environment'
    || code === 'auth/web-storage-unsupported'
    || code === 'auth/timeout';
}

async function startGoogleRedirectFlow() {
  // Redirect adalah opsi terakhir. Firebase redirect bergantung pada
  // penyimpanan lintas-origin dan gagal di browser yang mempartisi storage
  // ("missing initial state"), jadi popup selalu dicoba lebih dulu.
  // Penting: JANGAN memanggil getRedirectResult() setelah signInWithRedirect()
  // di halaman yang sama. Hasil redirect diproses saat boot berikutnya.
  const controller = new AbortController();
  const waiting = showGoogleWaitingModal({
    onCancel: () => controller.abort(),
  });
  try {
    await startGoogleAuthRedirect({ signal: controller.signal });
  } catch (error) {
    waiting.close();
    throw error;
  }
  // Halaman akan segera berpindah ke Google. Biarkan modal tetap terbuka
  // (browser akan meng-unload halaman ini) dan jangan menampilkan error.
  return new Promise(() => {});
}

export async function signInWithGoogleFlow() {
  // Popup lebih tahan terhadap browser yang memblokir/mempartisi third-party
  // storage. Banyak browser mobile tidak lagi bisa menyelesaikan
  // signInWithRedirect karena state OAuth lintas-origin hilang.
  try {
    const session = await startGoogleAuthPopup();
    GoogleDrive.adoptSession(session);
    return session.account;
  } catch (error) {
    if (!canFallbackToRedirect(error)) throw error;
    console.warn('Popup Google tidak tersedia, memakai redirect:', error);
  }
  return startGoogleRedirectFlow();
}

function lockApplication({ expired = false } = {}) {
  if (!store.currentUser?.pinHash) {
    leaveApplication().catch(() => {});
    if (expired) toast('Sesi berakhir. Masuk kembali dengan Google.', 'info');
    return;
  }
  clearSession();
  ui.currentUser = store.currentUser;
  ui.locked = true;
  ui.appMounted = false;
  closeModal({ silent: true });
  renderAuth();
  if (expired) toast('Aplikasi terkunci karena tidak ada aktivitas.', 'info');
}

async function leaveApplication() {
  clearSession();
  clearPendingGoogleLogin();
  store.setCurrentUser(null);
  ui.currentUser = null;
  ui.locked = false;
  ui.appMounted = false;
  closeModal({ silent: true });
  // Keluar penuh dari Google & Firebase agar sesi tidak tersisa dan login Google
  // diminta ulang saat masuk kembali.
  try { await GoogleDrive.signOut(); } catch { /* noop */ }
  try { await Cloud.signOutFirebase(); } catch { /* noop */ }
  renderAuth();
  toast('Anda sudah keluar.', 'info');
}

function checkAutoLock() {
  const session = getSession();
  if (!session || !store.currentUser) return;
  if (isSessionExpired(session, store.data.settings.autoLockMinutes)) {
    lockApplication({ expired: true });
  }
}

function runRecurring({ notify = false } = {}) {
  try {
    const result = store.processRecurring();
    if (result.posted > 0 && notify) {
      toast(`${result.posted} transaksi berulang otomatis dicatat.`, 'success');
    }
    return result;
  } catch (error) {
    console.error('Recurring processing failed:', error);
    return { posted: 0, dates: [] };
  }
}

function checkReminders() {
  if (!store.currentUser) return;
  const now = Date.now();
  if (now - lastReminderCheck < 45_000) return;
  lastReminderCheck = now;

  let due = [];
  try {
    due = store.remindersDue();
  } catch (error) {
    console.error(error);
    return;
  }
  if (!due.length) return;

  const canNotify = 'Notification' in window && Notification.permission === 'granted';
  due.forEach((note) => {
    if (canNotify) {
      try {
        const notification = new Notification(`Pengingat: ${note.title}`, {
          body: note.content ? note.content.replace(/<[^>]+>/g, ' ').slice(0, 120) : 'Catatan RISLY',
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: `risly-note-${note.id}`,
        });
        notification.onclick = () => {
          window.focus();
          openNoteEditor(note);
          notification.close();
        };
      } catch { /* some browsers require a service worker */ }
    }
    toast(`Pengingat: ${note.title}`, 'info');
    try { store.markReminderNotified(note.id); } catch { /* noop */ }
  });
}

/* -------------------------------------------------------------------------- */
/*  Modals                                                                   */
/* -------------------------------------------------------------------------- */

function openTransactionModal(tx = null, defaults = {}) {
  if (defaults.calcOpen === undefined) ui.calcOpen = false;
  openModal({
    size: 'lg',
    className: 'form-modal',
    html: transactionForm(tx, { ...defaults, type: defaults.type || tx?.type || 'expense' }),
  });
}

function openRecurringModal(rule = null, defaults = {}) {
  openModal({
    size: 'lg',
    className: 'form-modal',
    html: recurringForm(rule, defaults),
  });
}

function openAccountModal(account = null, defaultOwner = null) {
  openModal({ size: 'md', className: 'form-modal', html: accountForm(account, defaultOwner) });
}

function openCategoryModal(category = null, type = null) {
  openModal({
    size: 'md',
    className: 'form-modal',
    html: categoryForm(category, type || ui.categoryTab || category?.type || 'expense'),
  });
}

function openNoteEditor(note = null, kind = 'note') {
  openModal({
    size: 'lg',
    className: 'form-modal note-modal',
    html: noteEditorForm(note, kind),
  });
}

function renderGlobalSearchResults(query) {
  const q = normalizeSearch(query || '');
  if (!q) return '<p class="text-sm text-slate-500 dark:text-slate-400">Ketik untuk mencari transaksi, catatan, akun, dan kategori.</p>';
  const txs = store.transactions().filter((tx) => {
    const cat = store.categoryById(tx.categoryId);
    const acc = store.accountById(tx.accountId);
    return normalizeSearch([tx.note, cat?.name, acc?.name, tx.createdByName]).includes(q);
  }).slice(0, 8);
  const notes = (store.notes?.() || []).filter((note) => normalizeSearch([note.title, note.content]).includes(q)).slice(0, 6);
  const accounts = store.activeAccounts().filter((acc) => normalizeSearch(acc.name).includes(q)).slice(0, 6);
  const categories = store.categories('expense').concat(store.categories('income')).filter((cat) => normalizeSearch(cat.name).includes(q)).slice(0, 6);

  let html = '';
  if (txs.length) {
    html += '<div class="space-y-1 mb-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Transaksi</p>' +
      txs.map((tx) => `<button type="button" class="tx-row" data-action="global-open" data-type="tx" data-id="${escapeAttr(tx.id)}"><span class="tx-main"><span class="tx-title">${escapeHTML(tx.note || store.categoryById(tx.categoryId)?.name || 'Transaksi')}</span><span class="tx-meta">${escapeHTML(formatDate(tx.date))} · ${escapeHTML(store.accountName(tx.accountId))}</span></span><span class="tx-amount ${tx.type === 'income' ? 'amount-income' : tx.type === 'expense' ? 'amount-expense' : 'amount-transfer'}">${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${money(tx.amount)}</span></button>`).join('') + '</div>';
  }
  if (notes.length) {
    html += '<div class="space-y-1 mb-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Catatan</p>' +
      notes.map((note) => `<button type="button" class="settings-row" data-action="global-open" data-type="note" data-id="${escapeAttr(note.id)}"><span class="flex-1"><strong>${escapeHTML(note.title)}</strong><small>${escapeHTML(note.kind === 'todo' ? 'Tugas' : 'Catatan')}</small></span></button>`).join('') + '</div>';
  }
  if (accounts.length) {
    html += '<div class="space-y-1 mb-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Akun</p>' +
      accounts.map((acc) => `<button type="button" class="settings-row" data-action="global-open" data-type="account" data-id="${escapeAttr(acc.id)}"><span class="flex-1"><strong>${escapeHTML(acc.name)}</strong><small>${escapeHTML(acc.type)}</small></span></button>`).join('') + '</div>';
  }
  if (categories.length) {
    html += '<div class="space-y-1 mb-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Kategori</p>' +
      categories.map((cat) => `<button type="button" class="settings-row" data-action="global-open" data-type="category" data-id="${escapeAttr(cat.id)}"><span class="flex-1"><strong>${escapeHTML(cat.name)}</strong><small>${escapeHTML(cat.type || '')}</small></span></button>`).join('') + '</div>';
  }
  if (!html) html = '<p class="text-sm text-slate-500 dark:text-slate-400">Tidak ada hasil.</p>';
  return html;
}

function openGlobalSearch() {
  openModal({
    size: 'lg',
    html: `<header class="modal-header">
      <div>
        <p class="modal-kicker">Pencarian</p>
        <h2 class="modal-title">Cari di seluruh data</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <label class="field-label">Kata kunci
        <input class="field mt-1.5" id="global-search-input" type="search" placeholder="Transaksi, catatan, akun, kategori" autofocus>
      </label>
      <div id="global-search-results" class="mt-4">${renderGlobalSearchResults('')}</div>
    </div>`,
  });
  const input = document.getElementById('global-search-input');
  if (input) {
    input.addEventListener('input', () => {
      const node = document.getElementById('global-search-results');
      if (node) node.innerHTML = renderGlobalSearchResults(input.value);
    });
  }
}

function openAutoLockModal() {
  const current = Number(store.data.settings.autoLockMinutes) || 0;
  openModal({
    size: 'sm',
    html: `<form data-form="auto-lock" class="modal-form" novalidate>
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Keamanan sesi</p>
          <h2 class="modal-title">Kunci otomatis</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <label class="field-label">Kunci setelah tidak ada aktivitas
          <select class="field mt-1.5" name="autoLockMinutes">
            ${LOCK_OPTIONS.map((option) => `<option value="${option.value}" ${current === option.value ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}
          </select>
        </label>
      </div>
      <footer class="modal-footer">
        <span></span>
        <div class="flex gap-2 ml-auto">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
          <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} Simpan</button>
        </div>
      </footer>
    </form>`,
  });
}

function openThemeModal() {
  openModal({
    size: 'sm',
    html: `<div class="modal-form">
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Tampilan</p>
          <h2 class="modal-title">Tema</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <div class="theme-options">
          ${THEME_OPTIONS.map((option) => `<button type="button" class="theme-option ${prefs.theme === option.id ? 'is-active' : ''}" data-action="theme-set" data-theme="${option.id}">
            ${icon(option.icon, 'w-4 h-4')}<span>${escapeHTML(option.label)}</span>
          </button>`).join('')}
        </div>
      </div>
    </div>`,
  });
}

function openWeekModal() {
  const current = Number(store.data.settings.weekStartsOn) || 1;
  openModal({
    size: 'sm',
    html: `<form data-form="week-start" class="modal-form" novalidate>
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Kalender</p>
          <h2 class="modal-title">Awal pekan</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <label class="field-label">Hari pertama minggu
          <select class="field mt-1.5" name="weekStartsOn">
            ${WEEK_OPTIONS.map((option) => `<option value="${option.value}" ${current === option.value ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}
          </select>
        </label>
      </div>
      <footer class="modal-footer">
        <span></span>
        <div class="flex gap-2 ml-auto">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
          <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} Simpan</button>
        </div>
      </footer>
    </form>`,
  });
}

function openProfileSheet() {
  openModal({ size: 'md', className: 'sheet-panel modal-center profile-sheet', html: profileSheet(store.currentUser) });
}

function openMoreSheet() {
  openModal({ size: 'md', className: 'sheet-panel', html: moreSheet() });
}

function openTasksSheet() {
  openModal({ size: 'md', className: 'sheet-panel', html: tasksSheet() });
}

function openBudgetCategoriesModal() {
  openModal({ size: 'lg', className: '', html: budgetCategoriesModal(ui.budgetMonth || monthKey()) });
}

function openForgotPinModal() {
  const status = Cloud.getStatus();
  const canCloud = status.provider !== 'local';
  openModal({
    size: 'sm',
    html: `<div class="p-5 sm:p-6">
      <div class="flex items-start gap-3.5">
        <span class="confirm-icon text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400">${icon('lock', 'w-5 h-5')}</span>
        <div class="min-w-0">
          <h2 class="text-[17px] font-bold text-slate-900 dark:text-white">PIN tidak dapat dibuka paksa</h2>
          <p class="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">Demi keamanan, PIN disimpan sebagai hash satu arah. Pulihkan lewat backup JSON, data cloud dari perangkat lain, atau reset perangkat.</p>
        </div>
      </div>
      <div class="mt-5 space-y-2.5">
        ${canCloud ? `<button type="button" class="btn btn-secondary w-full" data-action="auth-reload-cloud">${icon('cloud', 'w-4 h-4')} Muat ulang data dari cloud</button>` : ''}
        <button type="button" class="btn btn-danger-soft w-full" data-action="auth-reset-local">${icon('rotate-ccw', 'w-4 h-4')} Reset aplikasi di perangkat ini</button>
        <button type="button" class="btn btn-ghost w-full" data-action="close-modal">Tutup</button>
      </div>
      <p class="mt-4 text-[11px] leading-5 text-slate-400">Reset perangkat memutus cloud dan menghapus data lokal. Data di cloud tidak dihapus, tetapi jangan lakukan reset jika Anda belum memiliki backup.</p>
    </div>`,
  });
}

function openInstallHelp() {
  openModal({
    size: 'md',
    html: `<div class="p-5 sm:p-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="page-eyebrow">PWA</p>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mt-1">Pasang RISLY</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Aplikasi berjalan layar penuh dan tetap bisa dibuka offline setelah dipasang.</p>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="mt-5 space-y-4">
        <div class="install-step"><span>${icon('device', 'w-5 h-5')}</span><div><strong>iPhone / iPad (Safari)</strong><p>Ketuk tombol Bagikan, lalu pilih <b>Tambahkan ke Layar Utama</b>. Buka dari ikon Home Screen agar mode standalone aktif.</p></div></div>
        <div class="install-step"><span>${icon('smartphone', 'w-5 h-5')}</span><div><strong>Android (Chrome)</strong><p>Buka menu tiga titik, pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</p></div></div>
        <div class="install-step"><span>${icon('monitor', 'w-5 h-5')}</span><div><strong>Desktop</strong><p>Klik ikon instal di bilah alamat browser, atau menu <b>Cast, save, and share → Install page as app</b>.</p></div></div>
      </div>
      <button type="button" class="btn btn-primary w-full mt-5" data-action="close-modal">Mengerti</button>
    </div>`,
  });
}

function authCloudFields(config = {}) {
  return cloudProviderFields(config, {
    includeLocal: false,
    withCreateBin: false,
    withSecurityNote: false,
    textareaRows: 5,
  });
}

function openAuthCloudModal() {
  openModal({
    size: 'md',
    className: 'form-modal',
    html: `<form data-form="auth-cloud" class="modal-form" novalidate>
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Sebelum masuk</p>
          <h2 class="modal-title">Hubungkan data cloud</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <p class="text-sm leading-6 text-slate-500 dark:text-slate-400">Pilih penyedia sinkron lain (JSONBin, Supabase, atau Firebase) yang sudah berisi data keluarga. Google Drive tidak dipakai untuk sinkron otomatis — gunakan tombol Google di atas untuk login dan backup manual.</p>
        ${authCloudFields(Cloud.getConfig())}
        <p class="form-error hidden" data-form-error role="alert"></p>
      </div>
      <footer class="modal-footer">
        <span></span>
        <div class="flex gap-2 ml-auto">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
          <button type="submit" class="btn btn-primary">${icon('cloud', 'w-4 h-4')} Hubungkan</button>
        </div>
      </footer>
    </form>`,
  });
}

/* -------------------------------------------------------------------------- */
/*  Calculator                                                               */
/* -------------------------------------------------------------------------- */

function updateCalculator(form) {
  if (!form) return;
  const input = form.querySelector('[name="amountExpression"]');
  const resultNode = form.querySelector('#tx-amount-result');
  if (!input || !resultNode) return;
  const value = expressionResult(input.value);
  if (value === null) {
    resultNode.textContent = input.value.trim() ? 'Ekspresi belum valid' : 'Masukkan nominal';
    resultNode.classList.add('text-slate-400');
    resultNode.classList.remove('text-slate-900', 'dark:text-white');
  } else {
    resultNode.textContent = formatCurrency(Math.round(value), { hide: false });
    resultNode.classList.remove('text-slate-400');
    resultNode.classList.add('text-slate-900', 'dark:text-white');
  }
}

function formatCalculatorInput(input) {
  const raw = input.value;
  if (!raw) return;
  const caret = input.selectionStart ?? raw.length;
  const meaningful = raw.slice(0, caret).replace(/[^\d,+×÷−]/g, '').length;
  const formatted = formatAmountExpression(raw);
  if (formatted === raw) return;
  input.value = formatted;
  let position = 0;
  let seen = 0;
  while (position < formatted.length && seen < meaningful) {
    if (/[\d,+×÷−]/.test(formatted[position])) seen += 1;
    position += 1;
  }
  try { input.setSelectionRange(position, position); } catch { /* noop */ }
}

function maskDateInput(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  let display = digits.slice(0, 2);
  if (digits.length > 2) display += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) display += `/${digits.slice(4, 8)}`;
  input.value = display;
  const form = input.closest('form');
  const hidden = form?.querySelector('input[name="date"][type="date"]');
  if (hidden) hidden.value = parseDateDMY(display) || '';
}

function toggleCalculator(button) {
  const form = button.closest('form');
  const panel = form?.querySelector('[data-calc-keypad]');
  if (!panel) return;
  const open = panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden', !open);
  button.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Sembunyikan kalkulator' : 'Tampilkan kalkulator');
  ui.calcOpen = open;
  if (open) {
    const input = form.querySelector('[name="amountExpression"]');
    input?.focus({ preventScroll: true });
  }
}

function handleCalculatorKey(button) {
  const form = button.closest('form');
  const input = form?.querySelector('[name="amountExpression"]');
  if (!input) return;
  const key = button.dataset.calcKey;
  let value = input.value;

  if (key === 'clear') {
    value = '';
  } else if (key === '=') {
    const result = expressionResult(value);
    if (result === null) {
      toast('Ekspresi belum valid.', 'error');
      input.focus();
      return;
    }
    value = String(Math.round(result * 100) / 100).replace('.', ',');
  } else if (key === ',') {
    const segment = value.split(/[+−×÷]/).pop();
    if (!segment) value += '0,';
    else if (!segment.includes(',')) value += ',';
  } else if (['+', '−', '×', '÷'].includes(key)) {
    if (!value) value = '0';
    if (/[+−×÷]$/.test(value)) value = value.slice(0, -1);
    if (value.endsWith(',')) value = value.slice(0, -1);
    value += key;
  } else {
    value += key;
  }

  input.value = formatAmountExpression(value);
  updateCalculator(form);
  input.focus({ preventScroll: true });
  try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* noop */ }
}

/* -------------------------------------------------------------------------- */
/*  Note editor helpers                                                      */
/* -------------------------------------------------------------------------- */

function setNoteSaveStatus(text) {
  const node = document.getElementById('note-save-status');
  if (node) node.textContent = text;
}

function collectNotePayload(form) {
  const fd = new FormData(form);
  const kind = form.dataset.noteKind === 'todo' ? 'todo' : 'note';
  const tags = String(fd.get('tags') || '')
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean);

  const items = [...form.querySelectorAll('.todo-item-row')]
    .map((row) => ({
      id: row.dataset.itemId || undefined,
      text: String(row.querySelector('.todo-item-input')?.value || '').trim(),
      done: row.querySelector('.todo-item-check')?.classList.contains('is-done') || false,
    }))
    .filter((item) => item.text);

  const editor = form.querySelector('[data-note-content]');
  const content = kind === 'todo'
    ? String(fd.get('description') || '')
    : sanitizeNoteHTML(editor ? editor.innerHTML : fd.get('content'));

  const reminderRaw = String(fd.get('reminderAt') || '');
  const reminderDate = parseDateTimeLocal(reminderRaw);

  const payload = {
    kind,
    title: String(fd.get('title') || '').trim(),
    content,
    color: String(fd.get('color') || (kind === 'todo' ? 'blue' : 'yellow')),
    pinned: String(fd.get('pinned') || '') === '1',
    favorite: String(fd.get('favorite') || '') === '1',
    tags,
    items,
    reminderAt: reminderDate ? reminderDate.toISOString() : null,
  };

  if (kind === 'todo') {
    payload.dueDate = String(fd.get('dueDate') || '') || null;
    payload.priority = String(fd.get('priority') || 'normal');
  }
  return payload;
}

function scheduleNoteAutosave(form) {
  if (!form?.dataset.id) return;
  setNoteSaveStatus('Menyimpan…');
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    try {
      const payload = collectNotePayload(form);
      if (!payload.title) {
        setNoteSaveStatus('Judul masih kosong');
        return;
      }
      store.updateNote(form.dataset.id, payload, { silent: true });
      setNoteSaveStatus('Tersimpan otomatis');
    } catch (error) {
      console.error('Note autosave failed:', error);
      setNoteSaveStatus('Gagal menyimpan');
    }
  }, 1_500);
}

function flushNoteAutosave() {
  if (!noteSaveTimer) return;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = null;
  const form = document.querySelector('form[data-form="note"][data-id]');
  if (!form?.dataset.id) return;
  try {
    const payload = collectNotePayload(form);
    if (payload.title) store.updateNote(form.dataset.id, payload, { silent: true });
  } catch (error) {
    console.error('Note autosave flush failed:', error);
  }
}

function changeNoteEditorKind(form, kind) {
  const draft = collectNotePayload(form);
  draft.id = undefined;
  draft.kind = kind;
  if (kind === 'todo') {
    draft.items = draft.items?.length ? draft.items : [];
    draft.description = draft.content;
  }
  // noteEditorForm reads `content`; todo reads the same field into description.
  openModal({
    size: 'lg',
    className: 'form-modal note-modal',
    html: noteEditorForm(draft, kind),
  });
}

/* -------------------------------------------------------------------------- */
/*  Cloud config                                                             */
/* -------------------------------------------------------------------------- */

function parseCloudConfig(form) {
  const fd = new FormData(form);
  const provider = String(fd.get('provider') || 'local');
  if (provider === 'local') return { provider: 'local' };

  if (provider === 'jsonbin') {
    return {
      provider,
      jsonbin: {
        binId: String(fd.get('jsonbinBinId') || '').trim(),
        masterKey: String(fd.get('jsonbinMasterKey') || '').trim(),
        binName: 'RISLY Money Manager',
      },
    };
  }
  if (provider === 'supabase') {
    return {
      provider,
      supabase: {
        url: String(fd.get('supabaseUrl') || '').trim(),
        anonKey: String(fd.get('supabaseAnonKey') || '').trim(),
        table: String(fd.get('supabaseTable') || 'households').trim(),
        rowId: String(fd.get('supabaseRowId') || APP.householdId).trim(),
      },
    };
  }
  if (provider === 'firebase') {
    const raw = String(fd.get('firebaseConfigJson') || '').trim();
    if (!raw) throw new Error('Konfigurasi Firebase wajib diisi.');
    try {
      JSON.parse(raw);
    } catch {
      throw new Error('Konfigurasi Firebase bukan JSON yang valid.');
    }
    return {
      provider,
      firebase: {
        configJson: raw,
        path: String(fd.get('firebasePath') || `households/${APP.householdId}`).trim(),
      },
    };
  }
  throw new Error('Penyedia cloud tidak dikenal.');
}

/* -------------------------------------------------------------------------- */
/*  Workspace sharing                                                        */
/* -------------------------------------------------------------------------- */

function openJoinWorkspaceModal() {
  openModal({
    size: 'sm',
    className: 'form-modal',
    html: `<form data-form="join-workspace" class="modal-form" novalidate>
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Ruang keluarga</p>
          <h2 class="modal-title">Gabung dengan kode</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <label class="field-label">Kode undangan
          <input class="field mt-1.5" name="inviteCode" maxlength="8" autocomplete="off" placeholder="ABC123" required>
        </label>
        <p class="form-error hidden" data-form-error role="alert"></p>
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">Lanjut dengan Google</button>
      </footer>
    </form>`,
  });
}

async function submitJoinWorkspace(form) {
  const code = stringValue(form, 'inviteCode').toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    showFormError(form, 'Kode undangan tidak valid.');
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const account = await signInWithGoogleFlow();
    const result = await store.joinWorkspaceByCode(code, account);
    closeModal({ silent: true });
    enterApplication(result.user);
    if (result?.localOnly) {
      toast('Bergabung ke ruang lokal. Cloud keluarga belum bisa dijangkau.', 'info');
    } else {
      toast('Bergabung ke ruang keluarga. Data akan disinkronkan.', 'success');
    }
  } catch (error) {
    console.error(error);
    showFormError(form, error.message || 'Gagal bergabung ke ruang.');
  } finally {
    if (submit) submit.disabled = false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Cloud actions                                                            */
/* -------------------------------------------------------------------------- */

async function connectCloudFromForm(form) {
  const config = parseCloudConfig(form);
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const result = await Cloud.connect(config);
    if (!result.ok) throw result.error || new Error('Koneksi cloud gagal.');
    toast(config.provider === 'local' ? 'Sinkronisasi cloud dimatikan.' : 'Cloud terhubung dan data sudah digabungkan.', 'success');
    closeModal({ silent: true });
    if (store.currentUser) {
      ui.appMounted = false;
      renderApplication();
    } else {
      renderAuth();
    }
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function testCloudFromForm(form) {
  const config = parseCloudConfig(form);
  const button = form.querySelector('[data-action="cloud-test"]');
  if (button) button.disabled = true;
  try {
    const result = await Cloud.test(config);
    if (result.ok) {
      toast(result.exists ? 'Koneksi berhasil. Data cloud ditemukan.' : 'Koneksi berhasil. Bin/tabel masih kosong.', 'success');
    } else {
      toast(`Koneksi gagal: ${result.error}`, 'error');
    }
  } finally {
    if (button) button.disabled = false;
  }
}

async function createJsonBinFromForm(form) {
  const config = parseCloudConfig(form);
  if (config.provider !== 'jsonbin') {
    toast('Pembuatan bin otomatis hanya tersedia untuk JSONBin.', 'info');
    return;
  }
  const button = form.querySelector('[data-action="create-jsonbin"]');
  if (button) button.disabled = true;
  try {
    const id = await Cloud.createJsonBin(config);
    const input = form.querySelector('[name="jsonbinBinId"]');
    if (input) input.value = id;
    toast('Bin JSONBin baru berhasil dibuat. Klik Simpan & hubungkan.', 'success');
  } catch (error) {
    toast(error.message || 'Gagal membuat bin.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}


/* -------------------------------------------------------------------------- */
/*  Actions                                                                  */
/* -------------------------------------------------------------------------- */

function openNativeDatePicker(wrap) {
  if (!wrap) return false;
  const display = wrap.querySelector('[name="dateDisplay"]');
  const native = wrap.querySelector('input[type="date"]');
  if (!native) return false;
  native.value = parseDateDMY(display?.value || '') || native.value || todayISO();
  try {
    if (typeof native.showPicker === 'function') {
      native.showPicker();
      return true;
    }
  } catch { /* fall through to a regular click for older browsers */ }
  try {
    // On mobile browsers the transparent native input is pointer-events:none,
    // so temporarily enable it before asking it to open.
    native.style.pointerEvents = 'auto';
    native.focus();
    native.click();
    setTimeout(() => { native.style.pointerEvents = 'none'; }, 500);
    return true;
  } catch {
    native.style.pointerEvents = 'none';
    return false;
  }
}

async function handleAction(action, element) {
  const id = element.dataset.id;
  switch (action) {
    /* Custom UI Actions */
    case 'switch-networth': {
      const targetId = element.dataset.target === 'family' ? 'family' : 'personal';

      // Tampilkan hanya panel yang dipilih (jangan bergantung pada class awal).
      ['personal', 'family'].forEach((key) => {
        const node = document.getElementById(`networth-${key}`);
        if (!node) return;
        const active = key === targetId;
        node.classList.toggle('hidden', !active);
        node.classList.toggle('block', active);
      });

      // 3. Ambil kontainer tombol dan reset gaya semua tombol di dalamnya
      const container = element.parentElement;
      const buttons = container.querySelectorAll('button');
      buttons.forEach(b => {
        b.classList.remove('bg-white/20', 'text-white', 'shadow-sm');
        b.classList.add('text-white/70');
         b.setAttribute('aria-pressed', 'false');
      });

      // 4. Beri gaya aktif pada tombol yang sedang diklik
      element.classList.remove('text-white/70');
      element.classList.add('bg-white/20', 'text-white', 'shadow-sm');
       element.setAttribute('aria-pressed', 'true');
      break;
    }

    /* Auth */
    case 'select-user':
      ui.selectedUser = element.dataset.user;
      renderAuth();
      break;
    case 'toggle-pin': {
      const input = document.getElementById('pin-input');
      if (!input) break;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      element.innerHTML = icon(show ? 'eye-off' : 'eye', 'w-4.5 h-4.5');
      input.focus();
      break;
    }
    case 'forgot-pin':
      openForgotPinModal();
      break;
    case 'auth-cloud':
      openAuthCloudModal();
      break;
    case 'auth-reload-cloud': {
      closeModal({ silent: true });
      const result = await Cloud.syncNow();
      if (result.ok) {
        renderAuth();
        toast('Data cloud dimuat. Coba masuk kembali.', 'success');
      } else {
        toast('Gagal memuat data cloud. Periksa koneksi dan konfigurasi.', 'error');
      }
      break;
    }
    case 'auth-reset-local': {
      const ok = await confirmDialog({
        title: 'Reset perangkat ini?',
        message: 'Data lokal dan koneksi cloud akan dihapus. Data cloud tetap ada, tetapi Anda perlu mengatur ulang PIN di perangkat ini.',
        confirmLabel: 'Reset perangkat',
      });
      if (!ok) return;
      try { await Cloud.disconnect(); } catch { /* noop */ }
      store.resetLocalData();
      clearSession();
      ui.locked = false;
      ui.selectedUser = null;
      closeModal({ silent: true });
      renderAuth();
      break;
    }

    /* Navigation & sheets */
    case 'nav':
      navigate(element.dataset.route || 'dashboard');
      break;
    case 'open-profile':
      openProfileSheet();
      break;
    case 'open-global-search':
      openGlobalSearch();
      break;
    case 'global-open': {
      const kind = element.dataset.type;
      const id = element.dataset.id;
      closeModal();
      if (kind === 'tx') {
        const tx = store.transactionById(id);
        if (tx) openTransactionModal(tx);
      } else if (kind === 'account') {
        const account = store.accountById(id);
        if (account) openAccountModal(account);
      } else if (kind === 'note') {
        const note = store.noteById ? store.noteById(id) : null;
        if (note) openNoteEditor(note, note.kind || 'note');
      } else if (kind === 'category') {
        navigate('categories');
      }
      break;
    }
    case 'open-auto-lock': {
      openAutoLockModal();
      break;
    }
    case 'open-theme-modal': {
      openThemeModal();
      break;
    }
    case 'open-week-modal': {
      openWeekModal();
      break;
    }
    case 'open-more':
      openMoreSheet();
      break;
    case 'open-budget-categories':
      openBudgetCategoriesModal();
      break;
    case 'open-tasks':
      openTasksSheet();
      break;
    case 'close-modal':
      flushNoteAutosave();
      closeModal();
      break;
    case 'reload-app':
      location.reload();
      break;
    case 'lock-app':
      lockApplication();
      break;
    case 'remove-pin': {
      const user = store.currentUser;
      if (!user?.pinHash) break;
      const ok = await confirmDialog({
        title: 'Hapus PIN?',
        message: 'Login Google tetap bisa masuk. Tanpa PIN, aplikasi tidak terkunci secara offline.',
        confirmLabel: 'Hapus',
      });
      if (!ok) return;
      store.updateUser(user.id, { pinHash: '', pinSalt: '', pinIterations: 0 });
      ui.appMounted = false;
      renderApplication();
      toast('PIN dihapus.', 'success');
      break;
    }
    case 'remove-member': {
      const member = store.getUser(id);
      if (!member) break;
      const ok = await confirmDialog({
        title: `Keluarkan ${member.name}?`,
        message: 'Anggota ini tidak bisa masuk lagi dengan akunnya. Data yang sudah dibuat tetap tersimpan.',
        confirmLabel: 'Keluarkan',
        danger: true,
      });
      if (!ok) return;
      try {
        let cloudRemoved = true;
        if (member.firebaseUid) {
          const result = await Cloud.removeHouseholdMember(member.firebaseUid);
          cloudRemoved = Boolean(result?.ok);
        }
        store.removeMember(id);
        ui.appMounted = false;
        renderApplication();
        toast(
          cloudRemoved
            ? `${member.name} dikeluarkan.`
            : `${member.name} dikeluarkan lokal. Akses cloud dicabut saat perangkat kembali online.`,
          'success',
        );
      } catch (error) {
        toast(error.message || 'Gagal mengeluarkan anggota.', 'error');
      }
      break;
    }
    case 'copy-invite': {
      const code = element.dataset.id || store.getWorkspaceCode();
      try {
        await navigator.clipboard.writeText(code);
        toast('Kode undangan disalin.', 'success');
      } catch {
        toast(`Kode: ${code}`, 'info');
      }
      break;
    }
    case 'rotate-invite': {
      const ok = await confirmDialog({
        title: 'Buat kode undangan baru?',
        message: 'Kode lama tidak bisa dipakai lagi. Bagikan kode baru ke anggota keluarga.',
        confirmLabel: 'Buat baru',
      });
      if (!ok) return;
      const previousCode = store.getWorkspaceCode();
      const code = store.rotateWorkspaceCode();
      try { await Cloud.publishInviteCode({ previousCode }); } catch { /* sync akan mencoba lagi */ }
      ui.appMounted = false;
      renderApplication();
      toast(`Kode baru: ${code}`, 'success');
      break;
    }
    case 'logout': {
      const ok = await confirmDialog({
        title: 'Keluar dari sesi?',
        message: 'Data tetap tersimpan. Anda perlu memasukkan PIN untuk masuk kembali.',
        confirmLabel: 'Keluar',
        danger: false,
        iconName: 'log-out',
      });
      if (ok) await leaveApplication();
      break;
    }
    case 'toggle-privacy':
      togglePrivacy();
      renderApplication();
      break;
    case 'toggle-sidebar': {
      const next = !prefs.sidebarCollapsed;
      savePrefs({ sidebarCollapsed: next });
      const shell = document.querySelector('.app-shell');
      if (shell) shell.classList.toggle('sidebar-collapsed', next);
      element.innerHTML = icon(next ? 'chevron-right' : 'chevron-left', 'w-4 h-4');
      element.setAttribute('aria-label', next ? 'Tampilkan menu samping' : 'Sembunyikan menu samping');
      element.title = next ? 'Tampilkan menu' : 'Sembunyikan menu';
      break;
    }
    case 'toggle-networth-filter': {
      const next = ui.networthFilter === 'mine' ? 'all' : 'mine';
      savePrefs({ networthFilter: next });
      ui.networthFilter = next;
      renderApplication();
      break;
    }
    case 'toggle-accounts-filter': {
      const next = prefs.accountsFilter === 'mine' ? 'all' : 'mine';
      savePrefs({ accountsFilter: next });
      renderApplication();
      break;
    }
    case 'set-accounts-view': {
      savePrefs({ accountsView: element.dataset.view === 'list' ? 'list' : 'grid' });
      renderApplication();
      break;
    }
    case 'set-categories-view': {
      savePrefs({ categoriesView: element.dataset.view === 'list' ? 'list' : 'grid' });
      renderApplication();
      break;
    }
    case 'set-networth-filter': {
      const next = element.dataset.scope === 'mine' ? 'mine' : 'all';
      savePrefs({ networthFilter: next });
      if (!ui.networthFilter) ui.networthFilter = next;
      ui.networthFilter = next;
      renderApplication();
      break;
    }
    case 'theme-set':
      setTheme(element.dataset.theme);
      renderApplication();
      break;
    case 'notifications':
      await requestNotifications();
      break;
    case 'install-help':
      openInstallHelp();
      break;
    case 'check-update':
      await checkForUpdate();
      break;
    case 'change-pin': {
      const user = store.currentUser;
      if (!user) break;
      closeModal({ silent: true });
      openModal({ size: 'md', className: 'form-modal', html: changePinForm(user) });
      break;
    }
    case 'edit-profile': {
      const user = store.currentUser;
      if (!user) break;
      closeModal({ silent: true });
      openModal({ size: 'md', className: 'form-modal', html: profileForm(user) });
      break;
    }

    /* Transactions */
    case 'add-tx': {
      if (!store.activeAccounts().length) {
        toast('Tambahkan akun terlebih dahulu.', 'info');
        openAccountModal();
        break;
      }
      closeModal({ silent: true });
      openTransactionModal(null, {
        type: element.dataset.type || 'expense',
        date: element.dataset.date || todayISO(),
      });
      break;
    }
    case 'edit-tx': {
      const tx = store.transactionById(id);
      if (!tx) {
        toast('Transaksi sudah tidak tersedia.', 'error');
        break;
      }
      openTransactionModal(tx);
      break;
    }
    case 'toggle-calc':
      toggleCalculator(element);
      break;
    case 'pick-date':
      openNativeDatePicker(element.closest('.date-input-wrap'));
      break;
    case 'delete-tx': {
      const tx = store.transactionById(id);
      if (!tx) break;
      if (store.isMonthLocked(tx.date.slice(0, 7))) {
        toast(`Bulan ${formatMonth(tx.date.slice(0, 7))} sudah ditutup. Buka buku kembali sebelum menghapus transaksi.`, 'error');
        break;
      }
      const ok = await confirmDialog({
        title: 'Hapus transaksi?',
        message: 'Saldo akun dan laporan akan langsung disesuaikan. Transaksi yang dihapus tidak dapat dikembalikan dari aplikasi.',
      });
      if (!ok) return;
      closeModal({ silent: true });
      store.deleteTransaction(id);
      toast('Transaksi dihapus.', 'success');
      renderApplication();
      break;
    }
    case 'tx-form-type': {
      const form = element.closest('form[data-form="transaction"]');
      if (!form) break;
      const fd = new FormData(form);
      const editingId = form.dataset.id;
      const original = editingId ? store.transactionById(editingId) : null;
      const amount = expressionResult(fd.get('amountExpression'));
      const values = {
        type: element.dataset.type,
        date: fd.get('date') || parseDateDMY(fd.get('dateDisplay')) || todayISO(),
        time: normalizeTime(fd.get('time'), currentTimeHHMM()),
        amount: amount === null ? '' : String(Math.round(amount * 100) / 100),
        accountId: fd.get('accountId') || '',
        accountOwner: fd.get('accountOwner') || store.accountById(String(fd.get('accountId') || ''))?.owner || store.currentUser?.id || 'all',
        toAccountId: fd.get('toAccountId') || '',
        categoryId: fd.get('categoryId') || '',
        subcategoryId: fd.get('subcategoryId') || '',
        note: fd.get('note') || '',
        recurring: Boolean(fd.get('makeRecurring')),
        recurringTitle: fd.get('recurringTitle') || '',
        frequency: fd.get('recurringFrequency') || 'monthly',
        calcOpen: ui.calcOpen,
      };
      const nextTx = original ? { ...original, ...values } : null;
      const nextHtml = transactionForm(nextTx, { ...values, type: values.type });
      const modalRoot = document.getElementById('modal-root');
      const panel = modalRoot?.querySelector('.modal-panel');
      if (panel) {
        panel.innerHTML = nextHtml;
        panel.classList.add('modal-in');
      } else {
        closeModal({ silent: true });
        openTransactionModal(nextTx, values);
      }
      break;
    }
    case 'delete-rec': {
      const rule = store.recurringById(id);
      if (!rule) break;
      const ok = await confirmDialog({
        title: 'Hapus jadwal?',
        message: `Jadwal "${rule.title}" akan dihentikan. Transaksi yang sudah terlanjur dibuat tetap tersimpan.`,
      });
      if (!ok) return;
      closeModal({ silent: true });
      store.deleteRecurring(id);
      toast('Jadwal berulang dihapus.', 'success');
      renderApplication();
      break;
    }

    /* Recurring */
    case 'add-rec':
      closeModal({ silent: true });
      openRecurringModal();
      break;
    case 'edit-rec': {
      const rule = store.recurringById(id);
      if (!rule) break;
      closeModal({ silent: true });
      openRecurringModal(rule);
      break;
    }
    case 'toggle-rec': {
      const rule = store.recurringById(id);
      if (!rule) break;
      store.setRecurringActive(id, !rule.active);
      toast(rule.active ? 'Jadwal dijeda.' : 'Jadwal diaktifkan.', 'success');
      break;
    }
    case 'post-rec': {
      const rule = store.recurringById(id);
      if (!rule) break;
      const posted = store.postRecurringNow(id);
      toast(posted ? 'Transaksi berulang berhasil diposting.' : 'Transaksi untuk tanggal ini sudah ada.', posted ? 'success' : 'info');
      renderApplication();
      break;
    }
    case 'process-recurring': {
      const result = runRecurring({ notify: false });
      toast(result.posted ? `${result.posted} transaksi berulang diproses.` : 'Tidak ada jadwal yang perlu diproses.', result.posted ? 'success' : 'info');
      renderApplication();
      break;
    }
    case 'rec-form-type': {
      const form = element.closest('form[data-form="recurring"]');
      if (!form) break;
      const fd = new FormData(form);
      const editingId = form.dataset.id;
      const original = editingId ? store.recurringById(editingId) : null;
      const values = {
        type: element.dataset.type,
        title: fd.get('title') || '',
        amount: fd.get('amount') || '',
        nextDate: fd.get('nextDate') || todayISO(),
        accountId: fd.get('accountId') || '',
        toAccountId: fd.get('toAccountId') || '',
        categoryId: fd.get('categoryId') || '',
        subcategoryId: fd.get('subcategoryId') || '',
        frequency: fd.get('frequency') || 'monthly',
        interval: fd.get('interval') || 1,
        endDate: fd.get('endDate') || '',
        note: fd.get('note') || '',
      };
      closeModal({ silent: true });
      if (original) openRecurringModal({ ...original, ...values }, values);
      else openRecurringModal(null, values);
      break;
    }

    /* Accounts */
    case 'open-member':
      ui.accountsMember = element.dataset.id || null;
      renderApplication();
      break;
    case 'accounts-back':
      ui.accountsMember = null;
      renderApplication();
      break;
    case 'add-account':
      closeModal({ silent: true });
      openAccountModal(null, element.dataset.owner || null);
      break;
    case 'edit-account': {
      const account = store.accountById(id);
      if (!account) break;
      closeModal({ silent: true });
      openAccountModal(account);
      break;
    }
    case 'archive-account': {
      const account = store.accountById(id);
      if (!account) break;
      store.setAccountArchived(id, true);
      closeModal({ silent: true });
      toast(`Akun ${account.name} diarsipkan.`, 'success');
      renderApplication();
      break;
    }
    case 'delete-account': {
      const account = store.accountById(id);
      if (!account) break;
      const ok = await confirmDialog({
        title: 'Hapus akun?',
        message: `Akun "${account.name}" akan dihapus permanen. Transaksi lama tetap menyimpan referensi akun ini.`,
      });
      if (!ok) return;
      store.deleteAccount(id);
      toast('Akun dihapus.', 'success');
      renderApplication();
      break;
    }
    case 'add-goal':
      closeModal({ silent: true });
      openModal({ size: 'md', className: 'form-modal', html: goalForm() });
      break;
    case 'edit-goal': {
      const goal = store.goalById(id);
      if (!goal) break;
      closeModal({ silent: true });
      openModal({ size: 'md', className: 'form-modal', html: goalForm(goal) });
      break;
    }
    case 'delete-goal': {
      const goal = store.goalById(id);
      if (!goal) break;
      const ok = await confirmDialog({
        title: 'Hapus target?',
        message: `Target "${goal.name}" akan dihapus.`,
      });
      if (!ok) return;
      store.deleteGoal(id);
      toast('Target dihapus.', 'success');
      renderApplication();
      break;
    }
    case 'restore-account': {
      const account = store.accountById(id);
      if (!account) break;
      store.setAccountArchived(id, false);
      closeModal({ silent: true });
      toast(`Akun ${account.name} diaktifkan kembali.`, 'success');
      renderApplication();
      break;
    }
    case 'filter-account':
      ui.txAccount = id;
      ui.txLast12 = false;
      ui.txMonth = 'all';
      ui.txType = 'all';
      ui.txCategory = 'all';
      ui.txUser = 'all';
      ui.txPage = 1;
      navigate('transactions');
      break;

    /* Categories */
    case 'add-category':
      closeModal({ silent: true });
      openCategoryModal(null, element.dataset.type || ui.categoryTab);
      break;
    case 'edit-category': {
      const category = store.categoryById(id);
      if (!category) break;
      closeModal({ silent: true });
      openCategoryModal(category);
      break;
    }
    case 'delete-category': {
      const category = store.categoryById(id);
      if (!category) break;
      const ok = await confirmDialog({
        title: 'Hapus kategori?',
        message: `Kategori "${category.name}" akan disembunyikan dari pilihan baru. Transaksi lama tetap menyimpan nama kategori ini.`,
      });
      if (!ok) return;
      store.deleteCategory(id);
      toast('Kategori dihapus.', 'success');
      renderApplication();
      break;
    }
    case 'add-sub': {
      const category = store.categoryById(id);
      if (!category) break;
      closeModal({ silent: true });
      openModal({ size: 'md', className: 'form-modal', html: subcategoryForm(category) });
      break;
    }
    case 'delete-sub': {
      const categoryId = element.dataset.category;
      const subId = element.dataset.sub;
      const sub = store.subcategoryById(categoryId, subId);
      if (!sub) break;
      const ok = await confirmDialog({
        title: 'Hapus subkategori?',
        message: `"${sub.name}" tidak akan muncul lagi pada transaksi baru.`,
      });
      if (!ok) return;
      store.deleteSubcategory(categoryId, subId);
      toast('Subkategori dihapus.', 'success');
      renderApplication();
      break;
    }
    case 'add-subcategory': {
      const categoryId = element.dataset.category;
      const category = store.categoryById(categoryId);
      if (!category) break;
      const input = document.querySelector(`[data-subcategory-manager="${CSS.escape(categoryId)}"] [data-subcategory-name]`)
        || element.closest('.subcategory-manager')?.querySelector('[data-subcategory-name]');
      const name = String(input?.value || '').trim();
      if (!name) {
        toast('Nama subkategori wajib diisi.', 'error');
        break;
      }
      store.addSubcategory(categoryId, name);
      if (input) input.value = '';
      toast('Subkategori ditambahkan.', 'success');
      const updated = store.categoryById(categoryId);
      closeModal({ silent: true });
      openCategoryModal(updated);
      break;
    }
    case 'rename-subcategory': {
      const categoryId = element.dataset.category;
      const subId = element.dataset.subcategory;
      const sub = store.subcategoryById(categoryId, subId);
      if (!sub) break;
      const name = window.prompt('Nama subkategori baru', sub.name);
      if (name === null) break;
      const trimmed = String(name).trim();
      if (!trimmed) {
        toast('Nama subkategori tidak boleh kosong.', 'error');
        break;
      }
      store.renameSubcategory(categoryId, subId, trimmed);
      toast('Subkategori diperbarui.', 'success');
      const updated = store.categoryById(categoryId);
      closeModal({ silent: true });
      openCategoryModal(updated);
      break;
    }
    case 'delete-subcategory': {
      const categoryId = element.dataset.category;
      const subId = element.dataset.subcategory;
      const sub = store.subcategoryById(categoryId, subId);
      if (!sub) break;
      const ok = await confirmDialog({
        title: 'Hapus subkategori?',
        message: `"${sub.name}" tidak akan muncul lagi pada transaksi baru.`,
      });
      if (!ok) return;
      store.deleteSubcategory(categoryId, subId);
      toast('Subkategori dihapus.', 'success');
      const updated = store.categoryById(categoryId);
      closeModal({ silent: true });
      openCategoryModal(updated);
      break;
    }
    case 'category-tab':
      ui.categoryTab = element.dataset.type === 'income' ? 'income' : 'expense';
      renderApplication();
      break;

    /* Budgets */
    case 'budget-prev':
      if (element.dataset.target === 'report') {
        ui.reportMonth = shiftMonthKey(ui.reportMonth || monthKey(), -1);
      } else {
        ui.budgetMonth = shiftMonthKey(ui.budgetMonth || monthKey(), -1);
      }
      renderApplication();
      break;
    case 'budget-next':
      if (element.dataset.target === 'report') {
        ui.reportMonth = shiftMonthKey(ui.reportMonth || monthKey(), 1);
      } else {
        ui.budgetMonth = shiftMonthKey(ui.budgetMonth || monthKey(), 1);
      }
      renderApplication();
      break;
    case 'copy-budget': {
      const ok = await confirmDialog({
        title: 'Salin anggaran bulan lalu?',
        message: 'Anggaran bulan ini akan ditimpa dengan anggaran bulan sebelumnya.',
        confirmLabel: 'Salin',
      });
      if (!ok) break;
      const current = ui.budgetMonth || monthKey();
      const previous = shiftMonthKey(current, -1);
      const entries = {};
      store.budgetStatus(previous).categories.forEach((item) => {
        if (item.limit > 0) entries[item.category.id] = item.limit;
      });
      const total = store.totalBudget(previous);
      if (total > 0) entries.__total__ = total;
      if (!Object.keys(entries).length) {
        toast('Bulan sebelumnya belum memiliki anggaran.', 'info');
        break;
      }
      store.setBudgets(current, entries);
      toast('Anggaran bulan sebelumnya berhasil disalin.', 'success');
      renderApplication();
      break;
    }

    /* Calendar */
    case 'calendar-prev':
      ui.calendarMonth = shiftMonthKey(ui.calendarMonth || monthKey(), -1);
      renderApplication();
      break;
    case 'calendar-next':
      ui.calendarMonth = shiftMonthKey(ui.calendarMonth || monthKey(), 1);
      renderApplication();
      break;
    case 'calendar-today':
      ui.calendarMonth = monthKey();
      renderApplication();
      break;
    case 'calendar-day':
      openModal({
        size: 'md',
        className: 'form-modal',
        html: dayDetailView(element.dataset.date),
      });
      break;

    /* Transactions filters */
    case 'tx-open-filter':
      openModal({ size: 'md', className: 'form-modal', html: transactionFilterModal() });
      break;
    case 'apply-tx-filter':
      closeModal({ silent: true });
      renderApplication();
      break;
    case 'tx-preset-month':
      ui.txLast12 = false;
      ui.txYear = String(new Date().getFullYear());
      ui.txMonth = String(new Date().getMonth() + 1).padStart(2, '0');
      ui.txPage = 1;
      renderApplication();
      break;
    case 'tx-preset-year':
      ui.txLast12 = false;
      ui.txYear = String(new Date().getFullYear());
      ui.txMonth = 'all';
      ui.txPage = 1;
      renderApplication();
      break;
    case 'tx-preset-recent': {
      ui.txLast12 = true;
      ui.txYear = 'all';
      ui.txMonth = 'all';
      ui.txPage = 1;
      renderApplication();
      break;
    }
    case 'tx-all-months':
      ui.txLast12 = false;
      ui.txYear = 'all';
      ui.txMonth = 'all';
      ui.txPage = 1;
      renderApplication();
      break;
    case 'reset-tx-filter':
      ui.txLast12 = false;
      ui.txYear = 'all';
      ui.txMonth = 'all';
      ui.txType = 'all';
      ui.txAccount = 'all';
      ui.txCategory = 'all';
      ui.txUser = 'all';
      ui.txQuery = '';
      ui.txPage = 1;
      {
        const modal = document.querySelector('[data-tx-filter-modal]');
        if (modal) {
          modal.querySelectorAll('select[data-filter]').forEach((select) => { select.value = 'all'; });
          const search = modal.querySelector('#tx-search');
          if (search) search.value = '';
        }
      }
      renderApplication();
      break;
    case 'tx-page':
      ui.txPage = Math.max(1, Number(element.dataset.page) || 1);
      renderApplication();
      break;

    /* Notes */
    case 'add-note':
      closeModal({ silent: true });
      openNoteEditor(null, 'note');
      break;
    case 'add-todo':
      closeModal({ silent: true });
      openNoteEditor(null, 'todo');
      break;
    case 'edit-note': {
      const note = store.noteById(id);
      if (!note) break;
      closeModal({ silent: true });
      openNoteEditor(note, note.kind);
      break;
    }
    case 'notes-tab':
      ui.notesTab = element.dataset.tab || 'all';
      renderApplication();
      break;
    case 'notes-tag':
      ui.notesTag = element.dataset.tag || '';
      renderApplication();
      break;
    case 'notes-view':
      ui.notesView = element.dataset.view === 'list' ? 'list' : 'grid';
      savePrefs({ notesView: ui.notesView });
      renderApplication();
      break;
    case 'note-pin':
      store.toggleNoteFlag(id, 'pinned');
      renderApplication();
      break;
    case 'note-archive': {
      const note = store.noteById(id);
      if (!note) break;
      store.setNoteStatus(id, note.status === 'archived' ? 'active' : 'archived');
      toast(note.status === 'archived' ? 'Catatan diaktifkan kembali.' : 'Catatan diarsipkan.', 'success');
      closeModal({ silent: true });
      renderApplication();
      break;
    }
    case 'note-restore':
      store.setNoteStatus(id, 'active');
      toast('Catatan dipulihkan.', 'success');
      closeModal({ silent: true });
      renderApplication();
      break;
    case 'note-trash': {
      const note = store.noteById(id);
      if (!note) break;
      store.setNoteStatus(id, 'trashed');
      toast('Catatan dipindahkan ke sampah.', 'success');
      closeModal({ silent: true });
      renderApplication();
      break;
    }
    case 'note-purge': {
      const note = store.noteById(id);
      if (!note) break;
      const ok = await confirmDialog({
        title: 'Hapus permanen?',
        message: `"${note.title}" akan dihapus dari perangkat ini dan semua perangkat yang tersinkron. Tindakan ini tidak dapat dibatalkan.`,
      });
      if (!ok) return;
      store.purgeNote(id);
      toast('Catatan dihapus permanen.', 'success');
      renderApplication();
      break;
    }
    case 'note-duplicate': {
      const copy = store.duplicateNote(id);
      closeModal({ silent: true });
      toast('Catatan diduplikasi.', 'success');
      openNoteEditor(copy, copy.kind);
      break;
    }
    case 'empty-trash': {
      const ok = await confirmDialog({
        title: 'Kosongkan sampah?',
        message: 'Semua catatan di sampah akan dihapus permanen dari semua perangkat.',
        confirmLabel: 'Kosongkan',
      });
      if (!ok) return;
      const count = store.emptyTrash();
      toast(`${count} catatan dihapus permanen.`, 'success');
      renderApplication();
      break;
    }
    case 'todo-toggle':
      store.toggleTodoDone(id);
      renderApplication();
      break;
    case 'todo-item-toggle':
      store.toggleTodoItem(element.dataset.note, element.dataset.item);
      renderApplication();
      break;

    /* Note editor */
    case 'note-form-kind': {
      const form = element.closest('form[data-form="note"]');
      if (form) changeNoteEditorKind(form, element.dataset.kind === 'todo' ? 'todo' : 'note');
      break;
    }
    case 'toggle-form-pin':
    case 'toggle-form-favorite': {
      const form = element.closest('form[data-form="note"]');
      if (!form) break;
      const field = action === 'toggle-form-pin' ? 'pinned' : 'favorite';
      const hidden = form.querySelector(`input[name="${field}"]`);
      if (!hidden) break;
      const next = hidden.value === '1' ? '' : '1';
      hidden.value = next;
      element.classList.toggle('is-active', next === '1');
      break;
    }
    case 'add-todo-item': {
      const form = element.closest('form[data-form="note"]');
      const container = form?.querySelector('#todo-items');
      if (container) {
        container.insertAdjacentHTML('beforeend', todoItemRow());
        container.lastElementChild?.querySelector('.todo-item-input')?.focus();
      }
      break;
    }
    case 'remove-draft-item': {
      const row = element.closest('.todo-item-row');
      row?.remove();
      break;
    }
    case 'toggle-draft-item': {
      const row = element.closest('.todo-item-row');
      const check = row?.querySelector('.todo-item-check');
      if (!check) break;
      const done = !check.classList.contains('is-done');
      check.classList.toggle('is-done', done);
      check.innerHTML = done ? icon('check', 'w-3 h-3') : '';
      break;
    }
    case 'move-draft-item': {
      const row = element.closest('.todo-item-row');
      if (!row) break;
      const direction = Number(element.dataset.dir) || 1;
      if (direction < 0 && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
      if (direction > 0 && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
      break;
    }
    case 'note-format': {
      const form = element.closest('form[data-form="note"]');
      const editor = form?.querySelector('[data-note-content]');
      if (!editor) break;
      editor.focus();
      try {
        document.execCommand(element.dataset.cmd, false, element.dataset.value || null);
      } catch { /* noop */ }
      break;
    }
    case 'pick-note-color': {
      const form = element.closest('form[data-form="note"]');
      if (!form) break;
      const color = element.dataset.color;
      const hidden = form.querySelector('input[name="color"]');
      if (hidden) hidden.value = color;
      form.querySelectorAll('.note-color-dot').forEach((dot) => dot.classList.toggle('is-active', dot === element));
      const body = form.querySelector('.note-editor-body');
      if (body) body.dataset.color = color;
      break;
    }

    /* Colors */
    case 'toggle-color-picker': {
      const field = element.closest('[data-color-field]');
      const panel = field?.querySelector('[data-color-panel]');
      if (!panel) break;
      const open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
      element.setAttribute('aria-expanded', String(open));
      break;
    }
    case 'color-harmony': {
      const field = element.closest('[data-color-field]');
      if (!field) break;
      field.dataset.colorHarmony = element.dataset.harmony || 'analogous';
      field.querySelectorAll('[data-action="color-harmony"]').forEach((button) => {
        button.classList.toggle('is-active', button === element);
      });
      refreshColorField(field);
      break;
    }
    case 'pick-color': {
      const form = element.closest('form');
      if (!form) break;
      const color = element.dataset.color;
      const field = element.closest('[data-color-field]');
      if (field) {
        applyColorFieldValue(field, color);
      } else {
        const hidden = form.querySelector('input[name="color"]');
        if (hidden) hidden.value = color;
        form.querySelectorAll('.color-dot, .color-swatch').forEach((dot) => {
          dot.classList.toggle('is-active', dot === element);
        });
        const preview = form.querySelector('.category-preview');
        if (preview) preview.style.setProperty('--preview-color', color);
      }
      break;
    }

    /* Exports & data */
    case 'open-export-modal':
      openExportModal();
      break;
    case 'add-split':
      addSplitRow(element);
      break;
    case 'remove-split': {
      const form = element.closest('form');
      element.closest('[data-split-row]')?.remove();
      syncSplitTotal(form);
      break;
    }
    case 'remove-receipt': {
      const form = element.closest('form');
      const hidden = form?.querySelector('input[name="receipt"]');
      const wrap = form?.querySelector('[data-receipt-wrap]');
      const file = form?.querySelector('input[data-receipt-file]');
      const uploadWrap = form?.querySelector('[data-receipt-upload]');
      const selected = form?.querySelector('[data-receipt-selected]');
      if (hidden) hidden.value = '';
      if (wrap) wrap.classList.add('hidden');
      if (file) file.value = '';
      if (uploadWrap) uploadWrap.classList.remove('hidden');
      if (selected) selected.classList.add('hidden');
      break;
    }
    case 'view-receipt': {
      const form = element.closest('form');
      const receipt = form?.querySelector('input[name="receipt"]')?.value || element?.closest('[data-receipt-wrap]')?.querySelector('img')?.src;
      if (!receipt) break;
      openModal({
        size: 'lg',
        className: 'form-modal',
        html: `<div class="text-center">
          <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
          <img src="${escapeAttr(receipt)}" alt="Struk" class="mt-4 max-w-full max-h-[70vh] rounded border shadow-lg">
        </div>`,
      });
      break;
    }
    case 'import-transactions':
      openImportFormModal();
      break;
    case 'download-template-csv':
      downloadImportTemplate('csv');
      break;
    case 'download-template-xlsx':
      downloadImportTemplate('xlsx');
      break;
    case 'choose-import-file':
      closeModal({ silent: true });
      openImportFilePicker();
      break;
    case 'export-xlsx-all':
      exportExcel(null);
      break;
    case 'export-xlsx-month':
      exportExcel(ui.reportMonth || monthKey());
      break;
    case 'export-pdf':
      exportPdf(ui.reportMonth || monthKey());
      break;
    case 'export-xlsx-range':
      exportExcelRange(ui.reportRangeStart, ui.reportRangeEnd);
      break;
    case 'export-pdf-range':
      exportPdfRange(ui.reportRangeStart, ui.reportRangeEnd);
      break;
    case 'export-backup':
      backupNow();
      break;
    case 'close-month': {
      const month = ui.reportMonth || monthKey();
      const ok = await confirmDialog({
        title: 'Tutup buku bulan ini?',
        message: 'Bulan ' + escapeHTML(formatMonth(month)) + ' akan dikunci. Transaksi dan anggaran bulan ini tidak dapat diubah hingga buku dibuka kembali.',
        confirmLabel: 'Tutup buku',
        cancelLabel: 'Batal',
        danger: false,
        iconName: 'lock',
      });
      if (!ok) break;
      store.lockMonth(month, 'Penutupan buku bulanan');
      renderApplication();
      toast('Buku bulan ' + escapeHTML(formatMonth(month)) + ' ditutup.', 'success');
      break;
    }
    case 'reopen-month': {
      const month = ui.reportMonth || monthKey();
      const ok = await confirmDialog({
        title: 'Buka kembali buku?',
        message: 'Bulan ' + escapeHTML(formatMonth(month)) + ' akan dibuka kembali sehingga transaksi dapat diubah lagi.',
        confirmLabel: 'Buka kembali',
        cancelLabel: 'Batal',
        danger: false,
        iconName: 'unlock',
      });
      if (!ok) break;
      store.unlockMonth(month);
      renderApplication();
      toast('Buku bulan ' + escapeHTML(formatMonth(month)) + ' dibuka kembali.', 'info');
      break;
    }
    case 'carry-budget': {
      const from = shiftMonthKey(ui.budgetMonth || monthKey(), -1);
      const to = ui.budgetMonth || monthKey();
      const ok = await confirmDialog({
        title: 'Salin anggaran dari ' + escapeHTML(formatMonth(from)) + '?',
        message: 'Batas anggaran per kategori akan disalin ke bulan ' + escapeHTML(formatMonth(to)) + '. Anggaran yang sudah ada di bulan tujuan akan ditimpa.',
        confirmLabel: 'Salin',
        cancelLabel: 'Batal',
        danger: false,
        iconName: 'copy',
      });
      if (!ok) break;
      const result = store.carryBudgets(from, to);
      if (result.carried === 0) {
        toast('Bulan asal belum memiliki anggaran.', 'info');
        break;
      }
      toast('Anggaran dari ' + escapeHTML(formatMonth(from)) + ' telah disalin (' + result.carried + ' kategori).', 'success');
      renderApplication();
      break;
    }
    case 'loan-schedule':
      openLoanScheduleModal(element.dataset.id);
      break;
    case 'import-backup':
      pickBackupFile();
      break;
    case 'load-sample':
      await loadSampleData();
      break;
    case 'reset-app':
      await resetApplication();
      break;

    /* Cloud */
    case 'sync-now': {
      const result = await Cloud.syncNow();
      if (result.ok) {
        toast('Sinkronisasi selesai.', 'success');
        if (store.currentUser) renderApplication();
        else renderAuth();
      } else if (result.local) {
        toast('Sinkronisasi cloud belum diaktifkan.', 'info');
        if (store.currentUser) navigate('settings');
        else openAuthCloudModal();
      } else if (!result.offline) {
        toast('Sinkronisasi gagal. Periksa koneksi.', 'error');
      }
      break;
    }
    case 'cloud-disconnect': {
      const ok = await confirmDialog({
        title: 'Putuskan cloud?',
        message: 'Data tetap tersimpan lokal di perangkat ini. Sinkronisasi otomatis akan berhenti sampai dihubungkan kembali.',
        confirmLabel: 'Putuskan',
      });
      if (!ok) return;
      await Cloud.disconnect();
      toast('Koneksi cloud diputuskan.', 'success');
      renderApplication();
      break;
    }
    case 'gdrive-signin': {
      const label = element.innerHTML;
      element.disabled = true;
      element.textContent = 'Menghubungkan…';
      try {
        const account = await signInWithGoogleFlow();
        refreshDriveUi();
        if (store.currentUser) {
          ui.appMounted = false;
          renderApplication();
        } else {
          renderAuth();
        }
        toast(`Tersambung sebagai ${account.email}.`, 'success');
      } catch (error) {
        console.error(error);
        toast(error.message || 'Gagal masuk dengan Google.', 'error');
      } finally {
        element.disabled = false;
        element.innerHTML = label;
      }
      break;
    }
    case 'google-login': {
      const label = element.innerHTML;
      element.disabled = true;
      element.textContent = 'Menghubungkan…';
      try {
        const account = await signInWithGoogleFlow();
        const result = await store.signInWithGoogle(account);
        closeModal({ silent: true });
        enterApplication(result.user);
        if (result.created) toast('Ruang baru dibuat.', 'success');
        else if (result.adopted) toast('Ruang keluarga dipulihkan.', 'success');
        else toast(`Masuk sebagai ${result.user.name}.`, 'success');
      } catch (error) {
        console.error(error);
        toast(error.message || 'Gagal masuk dengan Google.', 'error');
      } finally {
        element.disabled = false;
        element.innerHTML = label;
      }
      break;
    }
    case 'google-join':
      openJoinWorkspaceModal();
      break;
    case 'sync-family': {
      const label = element.innerHTML;
      element.disabled = true;
      element.textContent = 'Menyinkronkan...';
      try {
        const result = await Cloud.syncNow();
        if (result?.ok) {
          ui.appMounted = false;
          renderApplication();
          toast('Ruang tersimpan ke cloud.', 'success');
        } else {
          toast('Gagal menyinkronkan ke cloud.', 'error');
        }
      } catch (error) {
        toast(error.message || 'Gagal menyinkronkan.', 'error');
      } finally {
        element.disabled = false;
        element.innerHTML = label;
      }
      break;
    }
    case 'sync-family-header': {
      element.disabled = true;
      try {
        let result = await Cloud.syncNow();
        if (result?.local) {
          const connected = await Cloud.connect(Cloud.getConfig());
          if (connected?.ok) result = await Cloud.syncNow();
          else result = connected;
        }
        if (result?.ok) {
          ui.appMounted = false;
          renderApplication();
          toast('Sinkronisasi cloud selesai.', 'success');
        } else if (result?.local) {
          toast('Sinkronisasi cloud belum diaktifkan.', 'info');
        } else {
          toast(result?.error?.message || 'Gagal menyinkronkan ke cloud.', 'error');
        }
      } catch (error) {
        toast(error.message || 'Gagal menyinkronkan ke cloud.', 'error');
      } finally {
        element.disabled = false;
      }
      break;
    }
    case 'offline-open': {
      const opened = store.openLastWorkspace();
      if (!opened) {
        toast('Data terakhir tidak ditemukan. Masuk dengan Google.', 'info');
        break;
      }
      if (opened.hasPin) {
        ui.locked = true;
        ui.currentUser = opened.user;
        renderAuth();
      } else {
        enterApplication(opened.user);
      }
      break;
    }
    case 'switch-account':
      clearSession();
      store.setCurrentUser(null);
      ui.currentUser = null;
      ui.locked = false;
      ui.appMounted = false;
      closeModal({ silent: true });
      renderAuth();
      break;
    case 'google-restore': {
      const label = element.innerHTML;
      element.disabled = true;
      element.textContent = 'Menghubungkan…';
      try {
        const account = await signInWithGoogleFlow();
        if (!store.hasWorkspace) await store.signInWithGoogle(account);
        await openDriveRestoreModal();
      } catch (error) {
        console.error(error);
        toast(error.message || 'Gagal memulihkan dari Google Drive.', 'error');
      } finally {
        element.disabled = false;
        element.innerHTML = label;
      }
      break;
    }
    case 'gdrive-signout': {
      const ok = await confirmDialog({
        title: 'Putuskan Google?',
        message: 'Backup Drive berhenti di perangkat ini. Data lokal tetap aman.',
        confirmLabel: 'Putuskan',
      });
      if (!ok) return;
      await GoogleDrive.signOut();
      refreshDriveUi();
      toast('Akun Google diputuskan.', 'success');
      if (store.currentUser) {
        ui.appMounted = false;
        renderApplication();
      } else {
        renderAuth();
      }
      break;
    }
    case 'drive-backup':
      await driveBackupNow();
      break;
    case 'drive-restore':
      await openDriveRestoreModal();
      break;
    case 'drive-restore-file':
      await driveRestoreFile(id);
      break;
    case 'cloud-test': {
      const form = element.closest('form[data-form="cloud"]');
      if (form) await testCloudFromForm(form);
      break;
    }
    case 'create-jsonbin': {
      const form = element.closest('form[data-form="cloud"]');
      if (form) await createJsonBinFromForm(form);
      break;
    }
    case 'cloud-provider-change': {
      const form = element.closest('form');
      const provider = element.value;
      form?.querySelectorAll('[data-provider-section]').forEach((section) => {
        section.hidden = section.dataset.providerSection !== provider;
      });
      const help = form?.querySelector('[data-cloud-help], #cloud-provider-help');
      if (help) help.textContent = CLOUD_PROVIDERS[provider]?.description || '';
      break;
    }

    default:
      console.warn('Aksi belum ditangani:', action);
  }
}

/* -------------------------------------------------------------------------- */
/*  Form submissions                                                         */
/* -------------------------------------------------------------------------- */

async function submitLogin(form) {
  const userId = String(formValue(form, 'user') || ui.selectedUser || '');
  const pin = String(formValue(form, 'pin') || '');
  const user = store.getUser(userId);
  if (!user?.pinHash) {
    renderAuth();
    return;
  }
  const lockRemaining = getLockRemaining(user.id);
  if (lockRemaining > 0) {
    showFormError(form, `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(lockRemaining / 1000)} detik.`);
    return;
  }

  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const valid = await verifyPin(user, pin);
    if (valid) {
      resetFailedAttempts(user.id);
      enterApplication(user);
      return;
    }
    const result = registerFailedAttempt(user.id);
    if (result.remaining > 0) {
      showFormError(form, `PIN salah. Coba lagi dalam ${Math.ceil(result.remaining / 1000)} detik.`);
      ui.selectedUser = user.id;
      setTimeout(() => {
        if (!store.currentUser) renderAuth();
      }, 1_000);
    } else {
      showFormError(form, `PIN salah. Sisa ${result.attemptsLeft} percobaan sebelum terkunci.`);
      const input = form.querySelector('[name="pin"]');
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  } catch (error) {
    showFormError(form, error.message || 'PIN tidak valid.');
  } finally {
    if (submit) submit.disabled = false;
  }
}

function submitTransaction(form) {
  const fd = new FormData(form);
  const editingId = form.dataset.id;
  const originalTransaction = editingId ? store.transactionById(editingId) : null;
  const type = String(fd.get('type') || 'expense');
  const amount = expressionResult(fd.get('amountExpression'));
  const date = String(fd.get('date') || '') || parseDateDMY(fd.get('dateDisplay'));
  const time = normalizeTime(fd.get('time'), currentTimeHHMM());
  const accountId = String(fd.get('accountId') || '');
  const toAccountId = String(fd.get('toAccountId') || '');
  const categoryId = String(fd.get('categoryId') || '');
  const subcategoryId = String(fd.get('subcategoryId') || '');

  const makeSplit = fd.get('makeSplit') === '1';
  const splitRows = makeSplit ? Array.from(form.querySelectorAll('[data-split-row]')) : [];
  const splits = splitRows.map((row) => ({
    categoryId: String(row.querySelector('[name="splitCategory"]')?.value || '') || null,
    subcategoryId: String(row.querySelector('[name="splitSubcategory"]')?.value || '') || null,
    amount: Math.round(Number(row.querySelector('[name="splitAmount"]')?.value || 0)),
    note: String(row.querySelector('[name="splitNote"]')?.value || '').trim(),
  })).filter((split) => split.amount > 0);

  if (makeSplit) {
    if (!splits.length) {
      showFormError(form, 'Isi minimal satu baris split dengan nominal lebih dari nol.');
      return;
    }
    if (splits.some((split) => !split.categoryId)) {
      showFormError(form, 'Pilih kategori untuk setiap baris split.');
      return;
    }
  } else if (amount === null || amount <= 0) {
    showFormError(form, 'Nominal harus lebih dari nol. Gunakan angka atau ekspresi seperti 250000+50000.');
    return;
  }
  if (!date) {
    showFormError(form, 'Tanggal tidak valid. Gunakan format dd/mm/yyyy.');
    return;
  }
  const txMonth = String(date).slice(0, 7);
  if (store.isMonthLocked(txMonth)) {
    showFormError(form, `Bulan ${formatMonth(txMonth)} sudah ditutup. Buka buku kembali sebelum mencatat atau mengubah transaksi.`);
    return;
  }
  if (!time) {
    showFormError(form, 'Jam transaksi wajib diisi.');
    return;
  }
  if (!accountId) {
    showFormError(form, 'Pilih akun sumber dana.');
    return;
  }
  if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
    showFormError(form, 'Pilih akun tujuan yang berbeda dari akun sumber.');
    return;
  }
  if (type !== 'transfer' && !categoryId && !makeSplit && !originalTransaction?.adjustment) {
    showFormError(form, 'Pilih kategori transaksi.');
    return;
  }
  const selectedAccountForCheck = store.accountById(accountId);
  if (type === 'expense' && selectedAccountForCheck?.type === 'credit') {
    const creditLimit = safeNumber(selectedAccountForCheck.creditLimit);
    const spentSoFar = store.creditSpent(accountId);
    const remainingLimit = Math.max(0, creditLimit - spentSoFar);
    const checkAmount = makeSplit
      ? splits.reduce((sum, split) => sum + split.amount, 0)
      : amount;
    if (checkAmount > remainingLimit) {
      showFormError(form, `Nominal melebihi sisa limit kredit (sisa ${formatCurrency(remainingLimit)}).`);
      return;
    }
  }

  let finalAmount = amount;
  if (makeSplit && splits.length) {
    finalAmount = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  }

  const receiptValue = String(fd.get('receipt') || '').trim();

  const payload = {
    date,
    time,
    type,
    amount: Math.round(finalAmount || amount || 0),
    accountId,
    toAccountId: type === 'transfer' ? toAccountId : null,
    categoryId: type === 'transfer' ? null : (makeSplit && splits.length ? (splits[0].categoryId || null) : (categoryId || null)),
    subcategoryId: type === 'transfer' ? null : (makeSplit && splits.length ? (splits[0].subcategoryId || null) : (subcategoryId || null)),
    note: String(fd.get('note') || '').trim(),
    payee: String(fd.get('payee') || '').trim(),
    tags: String(fd.get('tags') || '')
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 20),
    splits: makeSplit ? splits : [],
    receipt: receiptValue || null,
  };

  try {
    if (editingId) {
      store.updateTransaction(editingId, payload);
      toast('Perubahan transaksi disimpan.', 'success');
    } else {
      store.addTransaction(payload);
      toast('Transaksi berhasil dicatat.', 'success');
      if (fd.get('makeRecurring')) {
        const frequency = String(fd.get('recurringFrequency') || 'monthly');
        const interval = Math.max(1, Number(fd.get('recurringInterval')) || 1);
        const anchorDay = Number(date.slice(8, 10)) || 1;
        store.saveRecurring({
          title: String(fd.get('recurringTitle') || '').trim() || payload.note || 'Transaksi berulang',
          type,
          amount: payload.amount,
          accountId,
          toAccountId: payload.toAccountId,
          categoryId: payload.categoryId,
          subcategoryId: payload.subcategoryId,
          note: payload.note,
          frequency,
          interval,
          nextDate: advanceDate(date, frequency, interval, anchorDay),
          endDate: null,
          autoPost: true,
          active: true,
        });
        toast('Jadwal berulang ikut dibuat.', 'success');
      }
    }
    closeModal({ silent: true });
    renderApplication();
  } catch (error) {
    console.error(error);
    showFormError(form, error.message || 'Gagal menyimpan transaksi.');
  }
}

function submitRecurring(form) {
  const fd = new FormData(form);
  const type = String(fd.get('type') || 'expense');
  const title = String(fd.get('title') || '').trim();
  const amount = Number(fd.get('amount'));
  const nextDate = String(fd.get('nextDate') || '');
  const accountId = String(fd.get('accountId') || '');
  const toAccountId = String(fd.get('toAccountId') || '');
  const categoryId = String(fd.get('categoryId') || '');
  const endDate = String(fd.get('endDate') || '');

  if (!title) {
    showFormError(form, 'Nama jadwal wajib diisi.');
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    showFormError(form, 'Nominal jadwal harus lebih dari nol.');
    return;
  }
  if (!nextDate) {
    showFormError(form, 'Tanggal jatuh tempo berikutnya wajib diisi.');
    return;
  }
  if (!accountId) {
    showFormError(form, 'Pilih akun untuk jadwal ini.');
    return;
  }
  if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
    showFormError(form, 'Pilih akun tujuan transfer yang berbeda.');
    return;
  }
  if (type !== 'transfer' && !categoryId) {
    showFormError(form, 'Pilih kategori jadwal.');
    return;
  }
  if (endDate && endDate < nextDate) {
    showFormError(form, 'Tanggal berakhir tidak boleh sebelum jatuh tempo berikutnya.');
    return;
  }

  try {
    store.saveRecurring({
      title,
      type,
      amount: Math.round(amount),
      nextDate,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      subcategoryId: type === 'transfer' ? null : String(fd.get('subcategoryId') || '') || null,
      frequency: String(fd.get('frequency') || 'monthly'),
      interval: Math.max(1, Number(fd.get('interval')) || 1),
      endDate: endDate || null,
      note: String(fd.get('note') || '').trim(),
      autoPost: Boolean(fd.get('autoPost')),
      active: Boolean(fd.get('active')),
    }, form.dataset.id || null);
    closeModal({ silent: true });
    toast('Jadwal berulang disimpan.', 'success');
    renderApplication();
  } catch (error) {
    console.error(error);
    showFormError(form, error.message || 'Gagal menyimpan jadwal.');
  }
}

function submitGoal(form) {
  const fd = new FormData(form);
  const editingId = form.dataset.id || null;
  const name = String(fd.get('name') || '').trim();
  if (!name) {
    showFormError(form, 'Nama target wajib diisi.');
    return;
  }
  const targetAmount = Number(fd.get('targetAmount')) || 0;
  const currentAmount = Number(fd.get('currentAmount')) || 0;
  const dueDate = String(fd.get('dueDate') || '').trim() || null;
  try {
    store.saveGoal({ name, targetAmount, currentAmount, dueDate }, editingId);
    closeModal({ silent: true });
    toast('Target disimpan.', 'success');
    renderApplication();
  } catch (error) {
    showFormError(form, error.message || 'Gagal menyimpan target.');
  }
}

function submitAccount(form) {
  const fd = new FormData(form);
  const editingId = form.dataset.id || null;
  const name = String(fd.get('name') || '').trim();
  if (!name) {
    showFormError(form, 'Nama akun wajib diisi.');
    return;
  }

  let balanceTarget;
  if (editingId) {
    const rawTarget = String(fd.get('balanceTarget') ?? '').trim();
    if (rawTarget !== '') {
      const parsedTarget = Number(rawTarget);
      if (!Number.isFinite(parsedTarget)) {
        showFormError(form, 'Saldo akun harus berupa angka.');
        return;
      }
      balanceTarget = Math.round(parsedTarget);
    }
  }

  try {
    const currentBalance = editingId ? store.accountBalance(editingId) : 0;
    store.saveAccount({
      name,
      type: String(fd.get('type') || 'cash'),
      color: String(fd.get('color') || '#3B82F6'),
      owner: String(fd.get('owner') || ''),
      sharedWith: fd.getAll('sharedWith').map((v) => String(v)),
      creditLimit: String(fd.get('creditLimit') || ''),
      creditDueDate: String(fd.get('creditDueDate') || ''),
      loanPrincipal: String(fd.get('loanPrincipal') || ''),
      loanInterestRate: String(fd.get('loanInterestRate') || ''),
      loanTermMonths: String(fd.get('loanTermMonths') || ''),
      loanMonthlyPayment: String(fd.get('loanMonthlyPayment') || ''),
      loanStartDate: String(fd.get('loanStartDate') || ''),
      loanNextDueDate: String(fd.get('loanNextDueDate') || ''),
      loanRemaining: String(fd.get('loanRemaining') || ''),
      ...(balanceTarget !== undefined ? { balanceTarget } : {}),
    }, editingId);
    const adjusted = balanceTarget !== undefined && balanceTarget !== Math.round(currentBalance);
    closeModal({ silent: true });
    toast(adjusted ? 'Akun disimpan dan penyesuaian saldo dicatat.' : 'Akun disimpan.', 'success');
    renderApplication();
  } catch (error) {
    showFormError(form, error.message || 'Gagal menyimpan akun.');
  }
}

function submitCategory(form) {
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  if (!name) {
    showFormError(form, 'Nama kategori wajib diisi.');
    return;
  }
  try {
    store.saveCategory({
      name,
      type: String(fd.get('type') || 'expense'),
      icon: String(fd.get('icon') || 'tag'),
      color: String(fd.get('color') || '#64748B'),
    }, form.dataset.id || null);
    closeModal({ silent: true });
    toast('Kategori disimpan.', 'success');
    renderApplication();
  } catch (error) {
    showFormError(form, error.message || 'Gagal menyimpan kategori.');
  }
}

function submitSubcategory(form) {
  const name = stringValue(form, 'name');
  const categoryId = form.dataset.category;
  if (!name) {
    showFormError(form, 'Nama subkategori wajib diisi.');
    return;
  }
  try {
    store.addSubcategory(categoryId, name);
    closeModal({ silent: true });
    toast('Subkategori ditambahkan.', 'success');
    renderApplication();
  } catch (error) {
    showFormError(form, error.message || 'Gagal menambah subkategori.');
  }
}

async function submitChangePin(form) {
  const user = store.getUser(form.dataset.user) || store.currentUser;
  if (!user) return;
  const currentPin = String(formValue(form, 'currentPin') || '');
  const newPin = String(formValue(form, 'newPin') || '');
  const confirmPin = String(formValue(form, 'confirmPin') || '');
  if (newPin !== confirmPin) {
    showFormError(form, 'PIN baru dan ulangannya tidak sama.');
    return;
  }
  if (!/^\d{4,8}$/.test(newPin)) {
    showFormError(form, 'PIN baru harus 4–8 angka.');
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const credentials = await changePin(user, currentPin, newPin);
    store.updateUser(user.id, credentials);
    closeModal({ silent: true });
    toast('PIN berhasil diubah. Perangkat lain akan menerima perubahan saat sinkron.', 'success');
  } catch (error) {
    showFormError(form, error.message || 'Gagal mengubah PIN.');
  } finally {
    if (submit) submit.disabled = false;
  }
}

function submitProfile(form) {
  const user = store.getUser(form.dataset.user) || store.currentUser;
  if (!user) return;
  const name = stringValue(form, 'name');
  if (!name) {
    showFormError(form, 'Nama tampilan wajib diisi.');
    return;
  }
  try {
    store.updateUser(user.id, {
      name,
      initials: getInitials(name),
      color: String(formValue(form, 'color') || user.color || '#2563EB'),
    });
    closeModal({ silent: true });
    ui.currentUser = store.getUser(user.id);
    ui.appMounted = false;
    renderApplication();
    toast('Profil diperbarui.', 'success');
  } catch (error) {
    showFormError(form, error.message || 'Gagal memperbarui profil.');
  }
}

async function submitNote(form) {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = null;
  const payload = collectNotePayload(form);
  if (!payload.title) {
    showFormError(form, 'Judul catatan atau tugas wajib diisi.');
    return;
  }
  const id = form.dataset.id;
  try {
    if (id) store.updateNote(id, payload);
    else store.saveNote(payload);
    closeModal({ silent: true });
    toast(id ? 'Perubahan disimpan.' : 'Catatan berhasil dibuat.', 'success');
    renderApplication();
  } catch (error) {
    console.error(error);
    showFormError(form, error.message || 'Gagal menyimpan catatan.');
  }
}

function submitBudgetTotal(form) {
  const amount = Number(formValue(form, 'amount')) || 0;
  store.setBudget(ui.budgetMonth || monthKey(), '__total__', amount);
  toast('Total anggaran disimpan.', 'success');
  renderApplication();
}

function submitBudgetCategories(form) {
  const entries = {};
  new FormData(form).forEach((value, key) => {
    if (key.startsWith('budget_')) entries[key.slice(7)] = Number(value) || 0;
  });
  store.setBudgets(ui.budgetMonth || monthKey(), entries);
  toast('Batas kategori disimpan.', 'success');
  closeModal({ silent: true });
  renderApplication();
}

function submitBudgetThresholds(form) {
  const warning = Number(formValue(form, 'warning'));
  const danger = Number(formValue(form, 'danger'));
  if (!Number.isFinite(warning) || !Number.isFinite(danger) || warning < 1 || danger > 100 || danger <= warning) {
    showFormError(form, 'Ambang bahaya harus lebih besar dari peringatan (1–100%).');
    return;
  }
  store.updateSettings({ budgetWarning: warning, budgetDanger: danger });
  toast('Ambang peringatan disimpan.', 'success');
  closeModal({ silent: true });
  renderApplication();
}

function submitHousehold(form) {
  const householdName = stringValue(form, 'householdName');
  if (!householdName) {
    showFormError(form, 'Nama ruang wajib diisi.');
    return;
  }
  store.updateSettings({
    householdName,
    workspaceName: householdName,
    defaultMonthlyBudget: formValue(form, 'defaultMonthlyBudget') === null
      ? store.data.settings.defaultMonthlyBudget
      : (Number(formValue(form, 'defaultMonthlyBudget')) || 0),
  });
  // Segarkan index kode undangan agar nama ruang terbaru ikut terlihat
  // saat anggota bergabung dari perangkat lain.
  Cloud.publishInviteCode().catch(() => {});
  toast('Identitas ruang disimpan.', 'success');
  renderApplication();
}

async function submitForm(form) {
  clearFormError(form);
  const type = form.dataset.form;
  switch (type) {
    case 'login':
      await submitLogin(form);
      break;
    case 'auto-lock': {
      const value = Number(form.querySelector('[name="autoLockMinutes"]')?.value || 0);
      store.updateSettings({ autoLockMinutes: Number.isFinite(value) ? value : 0 });
      closeModal();
      renderApplication();
      toast('Pengaturan sesi disimpan.', 'success');
      break;
    }
    case 'week-start': {
      const value = Number(form.querySelector('[name="weekStartsOn"]')?.value || 1);
      store.updateSettings({ weekStartsOn: Number.isFinite(value) ? value : 1 });
      closeModal();
      renderApplication();
      toast('Pengaturan kalender disimpan.', 'success');
      break;
    }
    case 'join-workspace':
      await submitJoinWorkspace(form);
      break;
    case 'transaction':
      submitTransaction(form);
      break;
    case 'recurring':
      submitRecurring(form);
      break;
    case 'account':
      submitAccount(form);
      break;
    case 'goal':
      submitGoal(form);
      break;
    case 'category':
      submitCategory(form);
      break;
    case 'subcategory':
      submitSubcategory(form);
      break;
    case 'change-pin':
      await submitChangePin(form);
      break;
    case 'profile':
      submitProfile(form);
      break;
    case 'note':
      await submitNote(form);
      break;
    case 'budget-total':
      submitBudgetTotal(form);
      break;
    case 'budget-categories':
      submitBudgetCategories(form);
      break;
    case 'budget-thresholds':
      submitBudgetThresholds(form);
      break;
    case 'import-transactions': {
      const imported = await submitImport(form);
      renderApplication();
      break;
    }
    case 'settings-household':
      submitHousehold(form);
      break;
    case 'cloud':
      await connectCloudFromForm(form);
      break;
    case 'auth-cloud':
      await connectCloudFromForm(form);
      break;
    default:
      console.warn('Form belum ditangani:', type);
  }
}

/* -------------------------------------------------------------------------- */
/*  Notifications & PWA                                                      */
/* -------------------------------------------------------------------------- */

async function requestNotifications() {
  if (!('Notification' in window)) {
    toast('Browser ini tidak mendukung notifikasi.', 'info');
    return;
  }
  if (Notification.permission === 'granted') {
    toast('Notifikasi sudah aktif.', 'success');
    checkReminders();
    return;
  }
  if (Notification.permission === 'denied') {
    toast('Notifikasi diblokir. Ubah izin di pengaturan browser.', 'error');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      toast('Notifikasi pengingat diaktifkan.', 'success');
      checkReminders();
    } else {
      toast('Izin notifikasi tidak diberikan.', 'info');
    }
    if (store.currentUser) renderApplication();
  } catch (error) {
    console.error(error);
    toast('Gagal meminta izin notifikasi.', 'error');
  }
}

async function checkForUpdate() {
  if (!swRegistration) {
    toast('Service worker belum aktif. Muat ulang halaman setelah online.', 'info');
    return;
  }
  try {
    await swRegistration.update();
    toast('Aplikasi sudah memeriksa pembaruan. Versi terbaru akan dipakai saat dibuka kembali.', 'success');
  } catch (error) {
    console.error(error);
    toast('Gagal memeriksa pembaruan.', 'error');
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') {
    console.info('Service worker dilewati pada mode file://. Gunakan server lokal atau HTTPS.');
    return;
  }
  if (new URLSearchParams(location.search).has('nosw')) {
    console.info('Service worker dilewati karena parameter ?nosw.');
    return;
  }
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    swRegistration = registration;
    window.__rislySWRegistration = registration;
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Versi baru RISLY tersedia.', 'info', {
            label: 'Muat ulang',
            onClick: () => {
              let reloaded = false;
              const reloadPage = () => {
                if (reloaded) return;
                reloaded = true;
                window.location.reload();
              };
              navigator.serviceWorker.addEventListener('controllerchange', reloadPage, { once: true });
              worker.postMessage({ type: 'SKIP_WAITING' });
              setTimeout(reloadPage, 1200);
            },
          });
        }
      });
    });
  }).catch((error) => console.warn('Service worker gagal didaftarkan:', error));

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'RISLY_UPDATED') {
      console.info('RISLY shell updated:', event.data.version);
    }
  });
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (prefs.installDismissed || isStandalone()) return;
    setTimeout(() => {
      toast('Pasang RISLY di layar utama untuk akses cepat dan mode offline.', 'info', {
        label: 'Pasang',
        onClick: async () => {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          const choice = await deferredInstallPrompt.userChoice.catch(() => null);
          deferredInstallPrompt = null;
          savePrefs({ installDismissed: true });
          if (choice?.outcome === 'accepted') toast('RISLY berhasil dipasang.', 'success');
        },
      });
    }, 3_500);
  });

  window.addEventListener('appinstalled', () => {
    savePrefs({ installDismissed: true });
    toast('RISLY berhasil dipasang di perangkat.', 'success');
  });
}

/* -------------------------------------------------------------------------- */
/*  Event wiring                                                             */
/* -------------------------------------------------------------------------- */

function bindEvents() {
  document.addEventListener('click', (event) => {
    const pinKey = event.target.closest('[data-pin-key]');
    if (pinKey) {
      event.preventDefault();
      const input = document.getElementById('pin-input');
      if (!input || input.disabled) return;
      const key = pinKey.dataset.pinKey;
      if (key === 'clear') input.value = '';
      else if (key === 'back') input.value = input.value.slice(0, -1);
      else if (input.value.length < 8) input.value += key;
      input.focus();
      return;
    }

    const calcKey = event.target.closest('[data-calc-key]');
    if (calcKey) {
      event.preventDefault();
      handleCalculatorKey(calcKey);
      return;
    }

    // Clicking the visible date field opens the native calendar directly.
    const dateDisplay = event.target.closest('input[name="dateDisplay"]');
    if (dateDisplay) {
      openNativeDatePicker(dateDisplay.closest('.date-input-wrap'));
      return;
    }

    const actionNode = event.target.closest('[data-action]');
    if (actionNode) {
      if (['SELECT', 'INPUT', 'TEXTAREA'].includes(actionNode.tagName)) return;
      event.preventDefault();
      actionNode.classList.add('is-pressed');
      setTimeout(() => actionNode.classList.remove('is-pressed'), 140);
      Promise.resolve(handleAction(actionNode.dataset.action, actionNode)).catch((error) => {
        console.error('Action failed:', error);
        toast(error.message || 'Terjadi kesalahan.', 'error');
      });
      return;
    }

    const navLink = event.target.closest('a[href^="#/"]');
    if (navLink) closeModal({ silent: true });
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    // Sinkronkan nilai hidden input tags dari chip sebelum submit
    form.querySelectorAll('[data-tag-input]').forEach((wrap) => {
      const hidden = wrap.querySelector('[data-tag-value]');
      const chips = wrap.querySelectorAll('.tag-chip');
      const values = Array.from(chips).map((c) => c.dataset.tag || '').filter(Boolean);
      if (hidden) hidden.value = values.join(', ');
    });
    event.preventDefault();
    Promise.resolve(submitForm(form)).catch((error) => {
      console.error('Form submission failed:', error);
      showFormError(form, error.message || 'Terjadi kesalahan saat menyimpan.');
    });
  });

  // Amount input is intentionally left empty until the user types.
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[name="amountExpression"]')) {
      formatCalculatorInput(target);
      updateCalculator(target.closest('form'));
      return;
    }
    if (target.matches('[data-split-row] [name="splitAmount"]')) {
      syncSplitTotal(target.closest('form'));
      return;
    }
    if (target.matches('[name="dateDisplay"]')) {
      maskDateInput(target);
      return;
    }
    if (target.id === 'tx-search') {
      ui.txQuery = target.value;
      ui.txPage = 1;
      const snapshot = rememberFocus();
      debounceSearch(() => renderApplication({ focus: snapshot }))();
      return;
    }
    if (target.id === 'notes-search') {
      ui.notesQuery = target.value;
      const snapshot = rememberFocus();
      debounceSearch(() => renderApplication({ focus: snapshot }))();
      return;
    }
    const noteForm = target.closest('form[data-form="note"][data-id]');
    if (noteForm) scheduleNoteAutosave(noteForm);
  });

  // Tag input: buat chip saat Enter, spasi, koma, atau titik
  document.addEventListener('keydown', (event) => {
    const field = event.target.closest('[data-tag-field]');
    if (!field) return;
    const key = event.key;
    const isSeparator = key === 'Enter' || key === ' ' || key === ',' || key === '.';
    if (!isSeparator) return;
    event.preventDefault();
    const wrap = field.closest('[data-tag-input]');
    if (!wrap) return;
    const chipsContainer = wrap.querySelector('[data-tag-chips]');
    if (!chipsContainer) return;
    const raw = field.value.trim();
    if (!raw) return;
    const tag = raw.startsWith('#') ? raw : '#' + raw;
    // Hindari duplikat
    const exists = Array.from(chipsContainer.querySelectorAll('.tag-chip')).some((c) => (c.dataset.tag || '').toLowerCase() === tag.toLowerCase());
    if (exists) { field.value = ''; return; }
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.setAttribute('role', 'listitem');
    chip.dataset.tag = tag;
    chip.innerHTML = `${escapeHTML(tag)} <button type="button" class="tag-chip-remove" data-tag-remove aria-label="Hapus tag">×</button>`;
    field.before(chip);
    field.value = '';
  });

  // Hapus chip saat tombol × diklik
  document.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-tag-remove]');
    if (!removeBtn) return;
    event.preventDefault();
    const chip = removeBtn.closest('.tag-chip');
    if (chip) chip.remove();
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-color-custom]')) {
      const field = target.closest('[data-color-field]');
      if (field) setColorFieldBase(field, target.value);
      return;
    }
    if (target.matches('input[name="date"][type="date"]')) {
      const form = target.closest('form');
      const display = form?.querySelector('[name="dateDisplay"]');
      if (display) display.value = target.value ? formatDateDMY(target.value) : '';
      return;
    }
    if (target.matches('select[name="splitCategory"]')) {
      const row = target.closest('[data-split-row]');
      const subSelect = row?.querySelector('select[name="splitSubcategory"]');
      if (subSelect) {
        const cat = store.categoryById(target.value);
        const subs = cat?.subcategories?.filter((s) => !s.deletedAt) || [];
        subSelect.innerHTML = '<option value="">' + (subs.length ? 'Pilih Subkategori' : 'Tanpa subkategori') + '</option>' +
          subs.map((s) => '<option value="' + escapeAttr(s.id) + '">' + escapeHTML(s.name) + '</option>').join('');
        subSelect.disabled = !target.value || !subs.length;
      }
      return;
    }
    if (target.matches('input[data-receipt-file]')) {
      const form = target.closest('form');
      const hidden = form?.querySelector('input[name="receipt"]');
      const preview = form?.querySelector('[data-receipt-preview]');
      const wrap = form?.querySelector('[data-receipt-wrap]');
      const uploadWrap = form?.querySelector('[data-receipt-upload]');
      const selected = form?.querySelector('[data-receipt-selected]');
      const fileName = form?.querySelector('[data-receipt-name]');
      const file = target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 800;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            if (w >= h) { h = Math.round(h * (max / w)); w = max; }
            else { w = Math.round(w * (max / h)); h = max; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          if (dataUrl.length > 450_000) {
            toast('Ukuran struk terlalu besar. Coba foto dengan resolusi lebih kecil.', 'error');
            target.value = '';
            return;
          }
          if (hidden) hidden.value = dataUrl;
          if (preview) { preview.src = dataUrl; preview.classList.remove('hidden'); }
          if (wrap) wrap.classList.remove('hidden');
          if (uploadWrap) uploadWrap.classList.add('hidden');
          if (selected) selected.classList.remove('hidden');
          if (fileName) fileName.textContent = file.name;
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    }
    if (target.matches('[data-receipt-change]')) {
      const form = target.closest('form');
      const fileInput = form?.querySelector('input[data-receipt-file]');
      fileInput?.click();
    }
    if (target.matches('select[data-account-type-select]')) {
      const form = target.closest('form[data-form="account"]');
      const fields = form?.querySelector('[data-liability-fields]');
      if (fields) fields.style.display = ['credit', 'loan'].includes(target.value) ? '' : 'none';
      return;
    }
    if (target.matches('select[name="accountOwner"]')) {
      const form = target.closest('form');
      const accountSelect = form?.querySelector('select[name="accountId"]');
      if (accountSelect) {
        const ownerId = target.value === 'all' ? null : target.value;
        const accounts = store.data.accounts
          .filter((account) => !account.deletedAt)
          .filter((account) => !ownerId || account.owner === ownerId);
        const selected = accountSelect.value;
        accountSelect.innerHTML = '<option value="">Pilih Akun</option>' +
          accounts.map((account) => `<option value="${escapeAttr(account.id)}" ${selected === account.id ? 'selected' : ''}>${escapeHTML(account.name)}${account.archived ? ' (arsip)' : ''}</option>`).join('');
      }
      return;
    }
    if (target.dataset?.action) {
      Promise.resolve(handleAction(target.dataset.action, target)).catch((error) => {
        console.error('Change action failed:', error);
        toast(error.message || 'Terjadi kesalahan.', 'error');
      });
      if (target.dataset.action === 'cloud-provider-change') return;
    }
    const filter = target.dataset?.filter;
    if (filter) {
      switch (filter) {
        case 'tx-year':
          ui.txLast12 = false;
          ui.txYear = target.value || new Date().getFullYear().toString();
          ui.txPage = 1;
          break;
        case 'tx-month':
          ui.txLast12 = false;
          ui.txMonth = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'tx-type':
          ui.txType = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'tx-account':
          ui.txAccount = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'tx-category':
          ui.txCategory = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'tx-user':
          ui.txUser = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'calendar-month':
          if (target.value) ui.calendarMonth = target.value;
          break;
        case 'budget-month':
          if (target.value) {
            if (target.dataset.target === 'report') ui.reportMonth = target.value;
            else ui.budgetMonth = target.value;
          }
          break;
        case 'report-month':
          if (target.value) ui.reportMonth = target.value;
          break;
        case 'report-range-start':
          if (target.value) ui.reportRangeStart = target.value;
          break;
        case 'report-range-end':
          if (target.value) ui.reportRangeEnd = target.value;
          break;
        case 'notes-sort':
          ui.notesSort = target.value || 'updated';
          break;
        default:
          break;
      }
      renderApplication();
      return;
    }

    if (target.matches('select[name="categoryId"]')) {
      const form = target.closest('form[data-form="transaction"], form[data-form="recurring"]');
      const subcategory = form?.querySelector('select[name="subcategoryId"]');
      if (subcategory) {
        subcategory.innerHTML = subcategoryOptions(target.value);
        subcategory.disabled = !target.value || !(store.categoryById(target.value)?.subcategories?.length);
      }
      return;
    }

    if (target.matches('select[name="accountOwner"]')) {
      const form = target.closest('form[data-form="transaction"]');
      const accountSelect = form?.querySelector('select[name="accountId"]');
      if (accountSelect) {
        const selected = accountSelect.value;
        const owner = target.value || 'all';
        accountSelect.innerHTML = accountOptions(selected, null, owner, 'Pilih Akun');
        if (selected && ![...accountSelect.options].some((option) => option.value === selected)) {
          accountSelect.value = '';
        }
      }
      return;
    }

    if (target.dataset?.setting) {
      const key = target.dataset.setting;
      const value = Number(target.value);
      if (key === 'autoLockMinutes') {
        store.updateSettings({ autoLockMinutes: Number.isFinite(value) ? value : 15 });
        toast('Kunci otomatis diperbarui.', 'success');
      } else if (key === 'weekStartsOn') {
        store.updateSettings({ weekStartsOn: value === 0 ? 0 : 1 });
        toast('Awal pekan diperbarui.', 'success');
      }
      renderApplication();
      return;
    }

    if (target.matches('input[type="checkbox"]')) {
      const switchNode = target.nextElementSibling;
      if (switchNode?.classList.contains('switch')) {
        switchNode.classList.toggle('is-on', target.checked);
      }
      if (target.matches('[data-toggle-recurring]')) {
        const extra = target.closest('.recurring-box')?.querySelector('.recurring-extra');
        if (extra) extra.hidden = !target.checked;
      }
      if (target.matches('[data-toggle-split]')) {
        const form = target.closest('form');
        const section = form?.querySelector('.split-section');
        if (section) section.hidden = !target.checked;
        const catSelect = form?.querySelector('select[name="categoryId"]');
        if (catSelect) {
          if (target.checked) catSelect.removeAttribute('required');
          else catSelect.setAttribute('required', '');
        }
        if (target.checked) {
          const firstAmount = form?.querySelector('[data-split-row] [name="splitAmount"]');
          if (firstAmount && !firstAmount.value) {
            const current = expressionResult(form.querySelector('[name="amountExpression"]')?.value);
            if (current && current > 0) firstAmount.value = String(Math.round(current));
          }
        }
        syncSplitTotal(form);
      }
      const noteForm = target.closest('form[data-form="note"][data-id]');
      if (noteForm) scheduleNoteAutosave(noteForm);
      return;
    }

    const noteForm = target.closest('form[data-form="note"][data-id]');
    if (noteForm) scheduleNoteAutosave(noteForm);
  });

  document.addEventListener('mousedown', (event) => {
    if (event.target.closest('.note-toolbar')) event.preventDefault();
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-nav="accounts"]');
    if (!link || !ui.accountsMember) return;
    ui.accountsMember = null;
    if (location.hash === '#/accounts') renderApplication();
  });

  window.addEventListener('hashchange', () => {
    closeModal({ silent: true });
    if (store.currentUser) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      renderApplication();
    }
  });

  window.addEventListener('pointerdown', noteActivity, { passive: true });
  window.addEventListener('keydown', noteActivity);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAutoLock();
      if (store.currentUser) {
        runRecurring({ notify: false });
        checkReminders();
      }
    }
  });

  window.addEventListener('online', () => {
    if (store.currentUser) toast('Kembali online. Sinkronisasi akan dilanjutkan.', 'info');
  });

  window.addEventListener('resize', debounce(() => resizeCharts(), 180));

  setInterval(() => {
    checkAutoLock();
    if (store.currentUser) checkReminders();
    if (store.currentUser && Cloud.canSync()) {
      Cloud.syncNow().then(() => {}).catch(() => {});
    }
  }, 3_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.currentUser && Cloud.canSync()) {
      Cloud.syncNow().then(() => {}).catch(() => {});
    }
  });
}

const debounceSearch = debounce((callback) => callback(), 280);

function noteActivity() {
  if (!store.currentUser) return;
  const now = Date.now();
  if (now - lastActivityWrite < 30_000) return;
  lastActivityWrite = now;
  updateSessionActivity();
}

/* -------------------------------------------------------------------------- */
/*  Boot                                                                     */
/* -------------------------------------------------------------------------- */

function bindStore() {
  store.subscribe((event) => {
    if (event.silent) {
      updateSyncSlots(Cloud.getStatus());
      return;
    }
    scheduleRender(event.reason === 'sync:merge' ? 20 : 50);
  });

  Cloud.onStatus((status) => {
    updateSyncSlots(status);
    const pill = document.getElementById('cloud-live-status');
    if (pill) pill.innerHTML = status.error || status.message || status.providerLabel;
  });
}

async function tryResumeRedirectLogin() {
  // Hanya panggil getRedirectResult() bila browser memang baru kembali dari
  // redirect Google. Memanggilnya di setiap boot dapat menghapus/mengganggu
  // state redirect yang masih tertunda.
  if (!hasPendingGoogleAuthRedirect()) return false;

  try {
    // 1. Tangkap hasil redirect yang tertunda (getRedirectResult) — penting untuk iOS
    const session = await completeGoogleAuthLogin();
    if (session?.account?.email) {
      GoogleDrive.adoptSession(session);
      const result = await store.signInWithGoogle(session.account);
      enterApplication(result.user, { fresh: result.created });
      toast(`Masuk sebagai ${result.user.name}.`, 'success');
      return true;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return false;
    console.warn('Gagal menangkap redirect result:', error);
  }

  try {
    // 2. Tunggu onAuthStateChanged sebagai source of truth (untuk ITP iOS)
    // Batasi waktu tunggu agar tidak memblokir boot terlalu lama (10 detik)
    const uid = await Promise.race([
      Cloud.waitForFirebaseUser(),
      new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);

    if (uid) {
      const user = Cloud.getCurrentFirebaseUser();
      if (user?.email) {
        GoogleDrive.adoptSession({
          account: {
            email: user.email || '',
            name: user.displayName || '',
            picture: user.photoURL || '',
            clientId: APP.googleClientId,
          },
          accessToken: String(user.accessToken || ''),
          expiresAt: Date.now() + 3600_000,
        });
        const result = await store.signInWithGoogle({
          email: user.email || '',
          name: user.displayName || '',
          picture: user.photoURL || '',
          clientId: APP.googleClientId,
        });
        enterApplication(result.user, { fresh: result.created });
        toast(`Masuk sebagai ${result.user.name}.`, 'success');
        return true;
      }
    }
  } catch (error) {
    console.warn('Gagal melanjutkan sesi Firebase:', error);
  }

  clearGoogleAuthRedirectPending();
  return false;
}

async function boot() {
  if (!root) {
    console.error('Elemen #app-root tidak ditemukan.');
    return;
  }

  setSplashStatus('Memuat data...');
  store.init();
  setSplashStatus('Menyiapkan cloud...');
  Cloud.init(store);
  bindStore();
  bindEvents();
  initPullToRefresh();
  // Warm up Google Identity Services and Firebase Auth so the sign-in window
  // can be opened synchronously from the button tap (required by Safari/iOS).
  GoogleDrive.prepare().catch(() => {});
  void warmUpGoogleAuth();

  // Jangan paksa #/dashboard sebelum status login diketahui. Jika hash dipaksa
  // lebih awal, URL bisa nyangkut di #/dashboard padahal layar yang tampil
  // adalah halaman login.
  setSplashStatus('Memeriksa sesi...');
  const session = getSession();
  if (session?.workspaceId) {
    const opened = store.openWorkspace(session.workspaceId, { account: store.accountForWorkspace(session.workspaceId) });
    let user = opened ? store.resolveUser(session.userId) : null;
    if (opened && !user) {
      // The stored session can point at a user id that changed after a cloud
      // sync or an app update. Recover by account e-mail instead of sending
      // the user back to the login screen.
      const account = store.account;
      if (account?.email) user = store.ensureMember(account);
      else user = store.activeUsers()[0] || null;
    }
    const expired = isSessionExpired(session, store.data.settings.autoLockMinutes);
    if (!expired && user) {
      store.setCurrentUser(user.id);
      ui.currentUser = user;
      ui.selectedUser = user.id;
      if (session.userId !== user.id) createSession(user.id, session.workspaceId);
      else updateSessionActivity();
    } else if (user) {
      clearSession();
      store.setCurrentUser(user.id);
      ui.currentUser = user;
      ui.locked = Boolean(user.pinHash);
    } else {
      clearSession();
      ui.locked = false;
    }
  }

  // Sesi default permanen (tanpa kunci otomatis) agar tidak perlu login ulang.
  try {
    if (store.workspaceId && store.data?.settings?.autoLockMinutes === 15) {
      store.updateSettings({ autoLockMinutes: 0 });
    }
  } catch { /* noop */ }

  setSplashStatus('Memeriksa pembaruan...');
  registerServiceWorker();

  // Buka data terakhir otomatis (tanpa Google) agar aplikasi cepat diakses.
  // Sinkronisasi/backup Google Drive tetap bisa dilakukan dari Pengaturan.
  if (!store.currentUser && !getSession()?.workspaceId) {
    const opened = store.openLastWorkspace();
    if (opened) {
      if (opened.hasPin) {
        store.setCurrentUser(opened.user.id);
        ui.currentUser = opened.user;
        ui.selectedUser = opened.user.id;
        ui.locked = true;
        ui.appMounted = false;
      } else {
        store.setCurrentUser(opened.user.id);
        ui.currentUser = opened.user;
        ui.selectedUser = opened.user.id;
        ui.locked = false;
        ui.appMounted = false;
        savePrefs({ lastUser: opened.user.id });
        createSession(opened.user.id, store.workspaceId);
        if (!location.hash || !ROUTES[String(location.hash).replace(/^#\//, '')]) {
          try { history.replaceState(null, '', '#/dashboard'); } catch { /* noop */ }
        }
      }
    }
  }

  if (!store.currentUser) {
    const hadPendingRedirect = hasPendingGoogleAuthRedirect();
    const resumed = await tryResumeRedirectLogin();
    if (!resumed) {
      if (hadPendingRedirect) {
        // Pada iOS, redirect login bisa gagal karena ITP memblokir sesi cross-domain.
        if (isIos() && isStandalone()) {
          toast('Login Google di iOS standalone mungkin terhambat oleh keamanan Safari (ITP). Coba buka aplikasi di Safari biasa.', 'info');
        } else {
          toast('Login Google tidak dapat diselesaikan. Silakan coba lagi.', 'error');
        }
      }
      renderAuth();
      // Bersihkan hash agar URL tidak nyangkut di #/dashboard saat layar login.
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* noop */ }
    }
  } else {
    if (!location.hash) {
      try { history.replaceState(null, '', '#/dashboard'); } catch { /* noop */ }
    }
    // Pengguna sudah masuk tetapi baru kembali dari redirect Google (misalnya
    // saat menghubungkan ulang Drive dari Pengaturan). Ambil sesi barunya tanpa
    // mengganti akun aplikasi.
    if (hasPendingGoogleAuthRedirect()) {
      completeGoogleAuthLogin().then((session) => {
        if (!session?.account?.email) {
          clearGoogleAuthRedirectPending();
          return;
        }
        GoogleDrive.adoptSession(session);
        toast(`Google Drive terhubung sebagai ${session.account.email}.`, 'success');
        renderApplication();
      }).catch((error) => {
        clearGoogleAuthRedirectPending();
        console.warn('Gagal menyelesaikan redirect Google:', error);
      });
    }
    renderApplication();
    runRecurring({ notify: true });
    setTimeout(checkReminders, 1_500);
  }

  setupInstallPrompt();

  if (location.search.includes('debug=1')) {
    try {
      // Render a fresh transaction form and inspect the amount input value/placeholder
      const html = transactionForm(null, {});
      const match = html.match(/name="amountExpression"[^>]*>/);
      console.log('DEBUG amount input tag:', match ? match[0] : 'NOT FOUND');
    } catch (e) {
      console.error('DEBUG txform failed', e);
    }
  }
  if (location.search.includes('debug=1')) {
    try {
      const html = transactionForm(null, {});
      const idx = html.indexOf('name="time"');
      console.log('DEBUG time input:', html.slice(Math.max(0, idx-80), idx+120));
    } catch (e) {
      console.error('DEBUG timeform failed', e);
    }
  }
  // Sembunyikan splash setelah halaman target DAN sinkronisasi selesai,
  // agar banner "Sinkronisasi belum aktif" tidak sempat muncul.
  const finishSplash = () => { try { hideSplash(); } catch { /* noop */ } };
  if (store.hasWorkspace) {
    Cloud.bootstrap({ waitForAuth: true })
      .then(() => { if (store.currentUser && !ui.locked) renderApplication(); })
      .catch((error) => console.warn('Cloud bootstrap skipped:', error))
      .finally(finishSplash);
  } else {
    finishSplash();
  }

  window.__RISLY__ = { store, Cloud, navigate, version: APP.version };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
