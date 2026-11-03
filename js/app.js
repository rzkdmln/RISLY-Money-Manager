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
  ROUTES,
  TX_TYPES,
} from './config.js';
import { store } from './store.js';
import { Cloud } from './cloud.js';
import { GoogleDrive, googleAccountBadge } from './gdrive.js';
import {
  clearPendingGoogleLogin,
  resumeGoogleRelayLogin,
  shouldUseAuthRelay,
  startGoogleRelayLogin,
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
import { icon } from './icons.js';
import {
  applyTheme,
  closeModal,
  confirmDialog,
  emptyState,
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
  normalizeTime,
  nowISO,
  parseDateDMY,
  parseDateTimeLocal,
  readFileAsText,
  sanitizeNoteHTML,
  shiftMonthKey,
  todayISO,
  toDateTimeLocal,
} from './utils.js';

import { dashboardView } from './views/dashboard.js';
import { transactionsView, dayDetailView } from './views/transactions.js';
import { calendarView } from './views/calendar.js';
import { notesView, tasksSheet } from './views/notes.js';
import { accountsView } from './views/accounts.js';
import { budgetsView } from './views/budgets.js';
import { recurringView } from './views/recurring.js';
import { categoriesView } from './views/categories.js';
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
  recurringForm,
  subcategoryOptions,
  transactionForm,
} from './forms/transaction.js';
import { noteEditorForm, todoItemRow } from './forms/note.js';
import { cloudProviderFields } from './forms/cloud.js';

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

function renderApplication({ focus = null } = {}) {
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

function renderAuth() {
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

function enterApplication(user, { fresh = false } = {}) {
  store.setCurrentUser(user.id);
  ui.currentUser = user;
  ui.selectedUser = user.id;
  ui.locked = false;
  ui.appMounted = false;
  savePrefs({ lastUser: user.id });
  createSession(user.id, store.workspaceId);
  renderApplication();
  if (fresh) toast(`Selamat datang, ${user.name}.`, 'success');
  runRecurring({ notify: true });
  setTimeout(checkReminders, 1_200);
  // Sync family workspace from cloud in background
  if (store.workspaceId) {
    store.syncFamilyWorkspace().then((result) => {
      if (result?.changed && store.currentUser) {
        ui.appMounted = false;
        renderApplication();
        toast('Data ruang diperbarui dari cloud.', 'info');
      }
    }).catch(() => {});
  }
}

/**
 * Google sign-in for installed iOS PWAs.
 *
 * The Google window is a separate Safari sheet there, so it cannot hand a
 * session back through cookies/localStorage. The relay callback writes the
 * result to a tiny cloud relay and this helper polls it while the app stays
 * open. Must be called directly from the click so iOS allows the new window.
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
        Jendela Google sudah dibuka. Pilih akun Anda, lalu kembali ke aplikasi ini.
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

async function signInWithGoogleFlow() {
  if (!shouldUseAuthRelay()) {
    return GoogleDrive.signIn({ prompt: 'select_account' });
  }

  const controller = new AbortController();
  let waiting = null;
  const session = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      waiting?.close();
      fn(value);
    };

    waiting = showGoogleWaitingModal({
      onCancel: () => {
        controller.abort();
        clearPendingGoogleLogin();
        finish(reject, new Error('Masuk dengan Google dibatalkan.'));
      },
    });

    startGoogleRelayLogin({ signal: controller.signal }).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });

  GoogleDrive.adoptSession(session);
  return session.account;
}

function resumeGoogleLoginOnBoot() {
  const controller = new AbortController();
  const pending = resumeGoogleRelayLogin({ signal: controller.signal });
  if (!pending) return;

  const waiting = showGoogleWaitingModal({
    onCancel: () => {
      controller.abort();
      clearPendingGoogleLogin();
    },
  });

  pending.then(async (session) => {
    waiting.close();
    GoogleDrive.adoptSession(session);
    const result = await store.signInWithGoogle(session.account);
    enterApplication(result.user, { fresh: result.created });
    toast(`Masuk sebagai ${result.user.name}.`, 'success');
  }).catch((error) => {
    waiting.close();
    if (error?.name === 'AbortError') return;
    console.error(error);
    toast(error.message || 'Gagal menyelesaikan masuk dengan Google.', 'error');
  });
}

function lockApplication({ expired = false } = {}) {
  if (!store.currentUser?.pinHash) {
    leaveApplication();
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

function leaveApplication() {
  clearSession();
  store.setCurrentUser(null);
  ui.currentUser = null;
  ui.locked = false;
  ui.appMounted = false;
  closeModal({ silent: true });
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

function openAccountModal(account = null) {
  openModal({ size: 'md', className: 'form-modal', html: accountForm(account) });
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

function openProfileSheet() {
  openModal({ size: 'md', className: 'sheet-panel', html: profileSheet(store.currentUser) });
}

function openMoreSheet() {
  openModal({ size: 'md', className: 'sheet-panel', html: moreSheet() });
}

function openTasksSheet() {
  openModal({ size: 'md', className: 'sheet-panel', html: tasksSheet() });
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
/*  Spreadsheet & PDF exports                                                */
/* -------------------------------------------------------------------------- */

function typeLabel(type) {
  return TX_TYPES[type]?.label || 'Transaksi';
}

function accountPair(tx) {
  if (tx.type === 'transfer') {
    return `${store.accountName(tx.accountId)} → ${store.accountName(tx.toAccountId)}`;
  }
  return store.accountName(tx.accountId);
}

function categoryLabel(tx) {
  if (tx.type === 'transfer') return 'Transfer';
  const category = store.categoryById(tx.categoryId);
  const sub = tx.subcategoryId ? store.subcategoryById(tx.categoryId, tx.subcategoryId) : null;
  if (category && sub) return `${category.name} / ${sub.name}`;
  return category?.name || 'Tanpa kategori';
}

function exportExcel(month = null) {
  if (!window.XLSX) {
    toast('Pustaka Excel belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  const list = month ? store.transactionsForMonth(month) : store.transactions();
  if (!list.length) {
    toast('Tidak ada transaksi untuk diekspor.', 'info');
    return;
  }
  const rows = list.map((tx) => ({
    tanggal: tx.date,
    jenis: typeLabel(tx.type),
    nominal: Number(tx.amount) || 0,
    akun: accountPair(tx),
    kategori: categoryLabel(tx),
    pencatat: tx.createdByName || store.getUser(tx.createdBy)?.name || '—',
    catatan: tx.note || '',
  }));
  const worksheet = window.XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 28 }, { wch: 26 }, { wch: 14 }, { wch: 40 },
  ];
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, month ? `Transaksi ${month}`.slice(0, 31) : 'Semua transaksi');
  const suffix = month || 'semua';
  window.XLSX.writeFile(workbook, `RISLY-transaksi-${fileSafe(suffix)}.xlsx`);
  toast(`${list.length} transaksi berhasil diekspor ke Excel.`, 'success');
}

function exportExcelRange(start, end) {
  if (!window.XLSX) {
    toast('Pustaka Excel belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  if (!start || !end) {
    toast('Pilih rentang tanggal terlebih dahulu.', 'info');
    return;
  }
  const list = store.transactionsBetween(start, end);
  if (!list.length) {
    toast('Tidak ada transaksi pada rentang tersebut.', 'info');
    return;
  }
  const rows = list.map((tx) => ({
    tanggal: tx.date,
    jenis: typeLabel(tx.type),
    nominal: Number(tx.amount) || 0,
    akun: accountPair(tx),
    kategori: categoryLabel(tx),
    pencatat: tx.createdByName || store.getUser(tx.createdBy)?.name || '—',
    catatan: tx.note || '',
  }));
  const worksheet = window.XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 28 }, { wch: 26 }, { wch: 14 }, { wch: 40 },
  ];
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaksi rentang');
  const suffix = `${start}_${end}`;
  window.XLSX.writeFile(workbook, `RISLY-transaksi-${fileSafe(suffix)}.xlsx`);
  toast(`${list.length} transaksi berhasil diekspor ke Excel.`, 'success');
}

function pdfCurrency(value) {
  return formatCurrency(value, { hide: false }).replace('Rp', 'Rp ');
}

function exportPdf(month = monthKey()) {
  const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDFCtor) {
    toast('Pustaka PDF belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const summary = store.monthSummary(month);
  const categories = store.expenseByCategory(month);
  const list = store.transactionsForMonth(month);
  const household = store.data.settings.householdName || 'Risly';
  const categoryTotal = categories.reduce((total, item) => total + item.total, 0);
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('RISLY Money Manager', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Laporan keuangan ${formatMonth(month)} · ${household}`, 40, 54);
  doc.text(`Dibuat ${formatDate(todayISO())}`, pageWidth - 40, 54, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  const boxes = [
    { label: 'Pemasukan', value: summary.income, color: [22, 163, 74] },
    { label: 'Pengeluaran', value: summary.expense, color: [240, 68, 82] },
    { label: 'Arus kas', value: summary.net, color: [37, 99, 235] },
    { label: 'Tingkat tabungan', value: `${Math.round(summary.savingsRate)}%`, color: [124, 58, 237] },
  ];
  const boxWidth = (pageWidth - 80 - 3 * 12) / 4;
  boxes.forEach((box, index) => {
    const x = 40 + index * (boxWidth + 12);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, 94, boxWidth, 54, 7, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label.toUpperCase(), x + 12, 111);
    doc.setFontSize(13);
    doc.setTextColor(...box.color);
    doc.setFont('helvetica', 'bold');
    doc.text(typeof box.value === 'number' ? pdfCurrency(box.value) : box.value, x + 12, 132);
    doc.setFont('helvetica', 'normal');
  });

  if (categories.length) {
    doc.autoTable({
      startY: 166,
      head: [['Kategori pengeluaran', 'Total', 'Porsi']],
      body: categories.map((item) => [
        item.name,
        pdfCurrency(item.total),
        `${categoryTotal ? ((item.total / categoryTotal) * 100).toFixed(1) : '0'}%`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 40, right: 40 },
      tableWidth: 'wrap',
    });
  }

  doc.autoTable({
    startY: categories.length ? doc.lastAutoTable.finalY + 16 : 166,
    head: [['Tanggal', 'Jenis', 'Keterangan', 'Akun', 'Kategori', 'Nominal', 'Pencatat']],
    body: list.map((tx) => [
      tx.date,
      typeLabel(tx.type),
      tx.note || (tx.type === 'transfer' ? 'Transfer antar akun' : categoryLabel(tx)),
      accountPair(tx),
      categoryLabel(tx),
      `${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${pdfCurrency(tx.amount)}`,
      tx.createdByName || '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
    bodyStyles: { fontSize: 7.5, cellPadding: 5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 64 },
      2: { cellWidth: 170 },
      3: { cellWidth: 104 },
      4: { cellWidth: 104 },
      5: { halign: 'right', cellWidth: 82 },
      6: { cellWidth: 60 },
    },
    margin: { left: 40, right: 40, bottom: 38 },
    didDrawPage: (data) => {
      const height = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`RISLY Money Manager · ${household}`, 40, height - 18);
      doc.text(`Halaman ${data.pageNumber}`, pageWidth - 40, height - 18, { align: 'right' });
    },
  });

  if (!list.length) {
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('Belum ada transaksi pada bulan ini.', 40, (doc.lastAutoTable?.finalY || 170) + 26);
  }

  doc.save(`RISLY-laporan-${fileSafe(month)}.pdf`);
  toast('Laporan PDF berhasil dibuat.', 'success');
}

function exportPdfRange(start, end) {
  const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDFCtor) {
    toast('Pustaka PDF belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  if (!start || !end) {
    toast('Pilih rentang tanggal terlebih dahulu.', 'info');
    return;
  }
  const list = store.transactionsBetween(start, end);
  if (!list.length) {
    toast('Tidak ada transaksi pada rentang tersebut.', 'info');
    return;
  }
  const summary = store.summaryForTransactions(list);
  const household = store.data.settings.householdName || 'Risly';
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('RISLY Money Manager', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Laporan keuangan ${start} s/d ${end} · ${household}`, 40, 54);
  doc.text(`Dibuat ${formatDate(todayISO())}`, pageWidth - 40, 54, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  const boxes = [
    { label: 'Pemasukan', value: summary.income, color: [22, 163, 74] },
    { label: 'Pengeluaran', value: summary.expense, color: [240, 68, 82] },
    { label: 'Arus kas', value: summary.net, color: [37, 99, 235] },
    { label: 'Transaksi', value: String(list.length), color: [124, 58, 237] },
  ];
  const boxWidth = (pageWidth - 80 - 3 * 12) / 4;
  boxes.forEach((box, index) => {
    const x = 40 + index * (boxWidth + 12);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, 94, boxWidth, 54, 7, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label.toUpperCase(), x + 12, 111);
    doc.setFontSize(13);
    doc.setTextColor(...box.color);
    doc.setFont('helvetica', 'bold');
    doc.text(typeof box.value === 'number' ? pdfCurrency(box.value) : box.value, x + 12, 132);
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const headerY = 170;
  doc.text('Tanggal', 40, headerY);
  doc.text('Keterangan', 110, headerY);
  doc.text('Akun', 320, headerY);
  doc.text('Nominal', pageWidth - 40, headerY, { align: 'right' });
  doc.setDrawColor(226, 232, 240);
  doc.line(40, headerY + 6, pageWidth - 40, headerY + 6);

  let y = headerY + 20;
  list.slice(0, 40).forEach((tx) => {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 40;
    }
    doc.setTextColor(15, 23, 42);
    doc.text(formatDate(tx.date, { day: '2-digit', month: 'short', year: '2-digit' }), 40, y);
    const label = tx.note || store.categoryById(tx.categoryId)?.name || (tx.type === 'transfer' ? 'Transfer' : 'Transaksi');
    doc.text(String(label).slice(0, 46), 110, y);
    doc.text(String(store.accountName(tx.accountId)).slice(0, 26), 320, y);
    const amount = `${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${pdfCurrency(tx.amount)}`;
    doc.text(amount, pageWidth - 40, y, { align: 'right' });
    y += 14;
  });

  if (list.length > 40) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`... dan ${list.length - 40} transaksi lainnya.`, 40, y + 6);
  }

  doc.save(`RISLY-laporan-${fileSafe(start)}_${fileSafe(end)}.pdf`);
  toast('Laporan PDF rentang berhasil dibuat.', 'success');
}

/* -------------------------------------------------------------------------- */
/*  Backup / import / reset                                                  */
/* -------------------------------------------------------------------------- */

function backupNow() {
  const payload = {
    app: 'risly-money-manager',
    kind: 'risly-backup',
    version: APP.version,
    schemaVersion: APP.schemaVersion,
    exportedAt: nowISO(),
    data: store.exportSnapshot(),
  };
  downloadJSON(payload, `RISLY-backup-${localDateISO()}.json`);
  toast('Backup JSON berhasil diunduh.', 'success');
}

function pickBackupFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const data = parsed?.data && parsed.app === 'risly-money-manager' ? parsed.data : parsed;
      if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.users)) {
        throw new Error('Struktur backup tidak dikenali.');
      }
      const ok = await confirmDialog({
        title: 'Pulihkan backup?',
        message: 'Seluruh data lokal saat ini akan diganti oleh isi backup. Tindakan ini tidak dapat dibatalkan.',
        confirmLabel: 'Pulihkan',
        danger: false,
        iconName: 'upload',
      });
      if (!ok) return;
      store.importData(data);
      const user = store.currentUser || store.activeUsers()[0];
      if (!user?.pinHash) {
        clearSession();
        store.setCurrentUser(null);
        ui.appMounted = false;
        renderAuth();
      } else {
        ui.appMounted = false;
        renderApplication();
      }
      toast('Backup berhasil dipulihkan.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Backup gagal dibaca.', 'error');
    }
  });
  input.click();
}

async function loadSampleData() {
  const ok = await confirmDialog({
    title: 'Muat data contoh?',
    message: 'Data transaksi, anggaran, jadwal, dan catatan aktif akan diganti oleh contoh enam bulan. Akun dan kategori bawaan tetap dipakai.',
    confirmLabel: 'Muat contoh',
    danger: false,
    iconName: 'sparkles',
  });
  if (!ok) return;
  store.loadSampleData();
  ui.appMounted = false;
  renderApplication();
  toast('Data contoh berhasil dimuat.', 'success');
}

async function resetApplication() {
  const ok = await confirmDialog({
    title: 'Reset ruang ini?',
    message: 'Semua data, PIN, dan pengaturan ruang aktif akan dihapus dari perangkat ini. Ruang lain tidak terpengaruh.',
    confirmLabel: 'Reset sekarang',
    danger: true,
    iconName: 'alert-triangle',
  });
  if (!ok) return;
  clearSession();
  store.resetLocalData();
  ui.currentUser = null;
  ui.selectedUser = null;
  ui.locked = false;
  ui.appMounted = false;
  closeModal({ silent: true });
  renderAuth();
  toast('Ruang direset.', 'info');
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
    toast('Bergabung ke ruang keluarga.', 'success');
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
/*  Google Drive backup / restore                                            */
/* -------------------------------------------------------------------------- */

function driveFileStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function refreshDriveUi() {
  const account = GoogleDrive.getAccount();
  const connected = Boolean(account?.email);
  document.querySelectorAll('[data-gdrive-account]').forEach((node) => {
    node.innerHTML = googleAccountBadge(account);
  });
  document.querySelectorAll('[data-gdrive-when-connected]').forEach((node) => {
    node.hidden = !connected;
  });
  document.querySelectorAll('[data-drive-requires-google]').forEach((node) => {
    node.disabled = !connected;
    node.classList.toggle('is-disabled', !connected);
  });
}

/** Make sure we have a Drive token, signing in again when the old session expired. */
async function ensureDriveAccess() {
  if (!GoogleDrive.isConnected()) {
    await signInWithGoogleFlow();
    return;
  }
  try {
    await GoogleDrive.token();
  } catch {
    await signInWithGoogleFlow();
  }
}

async function driveBackupNow() {
  try {
    await ensureDriveAccess();
  } catch (error) {
    toast(error.message || 'Masuk dengan Google dulu untuk memakai backup Drive.', 'error');
    return;
  }
  const payload = {
    app: 'risly-money-manager',
    kind: 'risly-backup',
    version: APP.version,
    schemaVersion: APP.schemaVersion,
    exportedAt: nowISO(),
    data: store.exportSnapshot(),
  };
  try {
    const token = await GoogleDrive.token();
    const name = `${APP.driveBackupPrefix}${driveFileStamp()}.json`;
    await GoogleDrive.createFile(token, { name, content: JSON.stringify(payload) });
    const files = await GoogleDrive.listFiles(token);
    const backups = files.filter((file) => String(file.name || '').startsWith(APP.driveBackupPrefix));
    const stale = backups.slice(APP.driveBackupLimit);
    if (stale.length) {
      await Promise.allSettled(stale.map((file) => GoogleDrive.deleteFile(token, file.id)));
    }
    toast(`Backup tersimpan di Google Drive: ${name}`, 'success');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Backup ke Drive gagal.', 'error');
  }
}

async function openDriveRestoreModal() {
  try {
    await ensureDriveAccess();
  } catch (error) {
    toast(error.message || 'Masuk dengan Google dulu untuk memakai backup Drive.', 'error');
    return;
  }
  let files = [];
  try {
    const token = await GoogleDrive.token();
    files = (await GoogleDrive.listFiles(token))
      .filter((file) => String(file.name || '').startsWith(APP.driveBackupPrefix))
      .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));
  } catch (error) {
    toast(error.message || 'Gagal membaca daftar backup di Drive.', 'error');
    return;
  }
  const list = files.length
    ? files.map((file) => `<button type="button" class="drive-backup-row" data-action="drive-restore-file" data-id="${escapeAttr(file.id)}">
        <span class="drive-backup-icon">${icon('file-text', 'w-4 h-4')}</span>
        <span class="min-w-0 flex-1"><strong>${escapeHTML(file.name)}</strong><small>${escapeHTML(formatDateTime(file.createdTime))} · ${escapeHTML(formatBytes(Number(file.size) || 0))}</small></span>
        ${icon('chevron-right', 'w-4 h-4 text-slate-400')}
      </button>`).join('')
    : `<div class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada backup di Google Drive.</div>`;
  openModal({
    size: 'md',
    html: `<div class="p-5 sm:p-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="page-eyebrow">Google Drive</p>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mt-1">Pulihkan dari Drive</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Pilih berkas backup. Data lokal saat ini akan diganti.</p>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="drive-backup-list mt-4">${list}</div>
      <button type="button" class="btn btn-secondary w-full mt-4" data-action="close-modal">Tutup</button>
    </div>`,
  });
}

async function driveRestoreFile(fileId) {
  if (!fileId) return;
  const ok = await confirmDialog({
    title: 'Pulihkan backup dari Drive?',
    message: 'Seluruh data lokal saat ini akan diganti oleh isi backup. Tindakan ini tidak dapat dibatalkan.',
    confirmLabel: 'Pulihkan',
    danger: false,
    iconName: 'upload',
  });
  if (!ok) return;
  try {
    const token = await GoogleDrive.token();
    const text = await GoogleDrive.downloadFile(token, fileId);
    const parsed = JSON.parse(text);
    const data = parsed?.data && parsed.app === 'risly-money-manager' ? parsed.data : parsed;
    if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.users)) {
      throw new Error('Struktur backup tidak dikenali.');
    }
    store.importData(data);
    const account = GoogleDrive.getAccount();
    const accountEmail = String(account?.email || '').toLowerCase();
    let user = null;
    if (accountEmail) {
      user = store.ensureMember(account);
      store.registerAccount(account, store.workspaceId);
    } else {
      user = store.currentUser || store.activeUsers()[0] || null;
    }
    closeModal({ silent: true });
    if (!user) {
      renderAuth();
      toast('Backup dari Drive berhasil dipulihkan.', 'success');
      return;
    }
    enterApplication(user, { fresh: true });
    toast('Backup dari Drive berhasil dipulihkan.', 'success');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Pemulihan dari Drive gagal.', 'error');
  }
}

/* -------------------------------------------------------------------------- */
/*  Actions                                                                  */
/* -------------------------------------------------------------------------- */

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
        b.classList.remove('bg-white', 'dark:bg-slate-700/80', 'text-slate-800', 'dark:text-white', 'shadow-sm');
        b.classList.add('text-slate-500', 'dark:text-slate-400');
      });

      // 4. Beri gaya aktif pada tombol yang sedang diklik
      element.classList.remove('text-slate-500', 'dark:text-slate-400');
      element.classList.add('bg-white', 'dark:bg-slate-700/80', 'text-slate-800', 'dark:text-white', 'shadow-sm');
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
    case 'open-more':
      openMoreSheet();
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
        store.removeMember(id);
        ui.appMounted = false;
        renderApplication();
        toast(`${member.name} dikeluarkan.`, 'success');
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
      const code = store.rotateWorkspaceCode();
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
      if (ok) leaveApplication();
      break;
    }
    case 'toggle-privacy':
      togglePrivacy();
      renderApplication();
      break;
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
      closeModal({ silent: true });
      openTransactionModal(tx);
      break;
    }
    case 'toggle-calc':
      toggleCalculator(element);
      break;
    case 'pick-date': {
      const wrap = element.closest('.date-input-wrap');
      const display = wrap?.querySelector('[name="dateDisplay"]');
      const native = wrap?.querySelector('input[type="date"]');
      if (!native) break;
      native.value = parseDateDMY(display?.value || '') || native.value || todayISO();
      try {
        if (typeof native.showPicker === 'function') native.showPicker();
        else native.click();
      } catch {
        try { native.click(); } catch { /* noop */ }
      }
      break;
    }
    case 'delete-tx': {
      const tx = store.transactionById(id);
      if (!tx) break;
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
        accountOwner: fd.get('accountOwner') || 'all',
        toAccountId: fd.get('toAccountId') || '',
        categoryId: fd.get('categoryId') || '',
        subcategoryId: fd.get('subcategoryId') || '',
        note: fd.get('note') || '',
        recurring: Boolean(fd.get('makeRecurring')),
        recurringTitle: fd.get('recurringTitle') || '',
        frequency: fd.get('recurringFrequency') || 'monthly',
        calcOpen: ui.calcOpen,
      };
      closeModal({ silent: true });
      if (original) openTransactionModal({ ...original, ...values }, values);
      else openTransactionModal(null, values);
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
    case 'add-account':
      closeModal({ silent: true });
      openAccountModal();
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
    case 'category-tab':
      ui.categoryTab = element.dataset.type === 'income' ? 'income' : 'expense';
      renderApplication();
      break;

    /* Budgets */
    case 'budget-prev':
      ui.budgetMonth = shiftMonthKey(ui.budgetMonth || monthKey(), -1);
      renderApplication();
      break;
    case 'budget-next':
      ui.budgetMonth = shiftMonthKey(ui.budgetMonth || monthKey(), 1);
      renderApplication();
      break;
    case 'copy-budget': {
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
    case 'tx-all-months':
      ui.txYear = 'all';
      ui.txMonth = 'all';
      ui.txPage = 1;
      renderApplication();
      break;
    case 'reset-tx-filter':
      ui.txYear = 'all';
      ui.txMonth = 'all';
      ui.txType = 'all';
      ui.txAccount = 'all';
      ui.txCategory = 'all';
      ui.txUser = 'all';
      ui.txQuery = '';
      ui.txPage = 1;
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
    case 'pick-color': {
      const form = element.closest('form');
      if (!form) break;
      const color = element.dataset.color;
      const hidden = form.querySelector('input[name="color"]');
      if (hidden) hidden.value = color;
      form.querySelectorAll('.color-dot').forEach((dot) => dot.classList.toggle('is-active', dot === element));
      const preview = form.querySelector('.category-preview');
      if (preview) preview.style.setProperty('--preview-color', color);
      break;
    }

    /* Exports & data */
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
        const result = await store.syncFamilyWorkspace();
        if (result?.changed) {
          ui.appMounted = false;
          renderApplication();
          toast('Ruang diperbarui dari cloud.', 'success');
        } else {
          // Also try uploading
          const uploaded = await store.uploadFamilyWorkspace();
          if (uploaded) toast('Ruang tersimpan ke cloud.', 'success');
          else toast('Gagal menyimpan ke cloud. Periksa key/bin JSONBin.', 'error');
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
        const result = await store.syncFamilyWorkspace();
        if (result?.changed) {
          ui.appMounted = false;
          renderApplication();
          toast('Ruang diperbarui dari cloud.', 'success');
        } else {
          const uploaded = await store.uploadFamilyWorkspace();
          if (uploaded) toast('Ruang tersimpan ke cloud.', 'success');
          else toast('Gagal menyimpan ke cloud. Periksa key/bin JSONBin.', 'error');
        }
      } catch (error) {
        toast(error.message || 'Gagal menyinkronkan.', 'error');
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
  const type = String(fd.get('type') || 'expense');
  const amount = expressionResult(fd.get('amountExpression'));
  const date = String(fd.get('date') || '') || parseDateDMY(fd.get('dateDisplay'));
  const time = normalizeTime(fd.get('time'), currentTimeHHMM());
  const accountId = String(fd.get('accountId') || '');
  const toAccountId = String(fd.get('toAccountId') || '');
  const categoryId = String(fd.get('categoryId') || '');
  const subcategoryId = String(fd.get('subcategoryId') || '');

  if (amount === null || amount <= 0) {
    showFormError(form, 'Nominal harus lebih dari nol. Gunakan angka atau ekspresi seperti 250000+50000.');
    return;
  }
  if (!date) {
    showFormError(form, 'Tanggal tidak valid. Gunakan format dd/mm/yyyy.');
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
  if (type !== 'transfer' && !categoryId) {
    showFormError(form, 'Pilih kategori transaksi.');
    return;
  }

  const payload = {
    date,
    time,
    type,
    amount: Math.round(amount),
    accountId,
    toAccountId: type === 'transfer' ? toAccountId : null,
    categoryId: type === 'transfer' ? null : categoryId,
    subcategoryId: type === 'transfer' ? null : subcategoryId || null,
    note: String(fd.get('note') || '').trim(),
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

function submitAccount(form) {
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  if (!name) {
    showFormError(form, 'Nama akun wajib diisi.');
    return;
  }
  try {
    store.saveAccount({
      name,
      type: String(fd.get('type') || 'cash'),
      color: String(fd.get('color') || '#3B82F6'),
      openingBalance: Number(fd.get('openingBalance')) || 0,
    }, form.dataset.id || null);
    closeModal({ silent: true });
    toast('Akun disimpan.', 'success');
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
    defaultMonthlyBudget: Number(formValue(form, 'defaultMonthlyBudget')) || 0,
  });
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
    event.preventDefault();
    Promise.resolve(submitForm(form)).catch((error) => {
      console.error('Form submission failed:', error);
      showFormError(form, error.message || 'Terjadi kesalahan saat menyimpan.');
    });
  });

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target?.matches?.('[name="amountExpression"]')) {
      target.placeholder = '';
    }
  });
  document.addEventListener('focusout', (event) => {
    const target = event.target;
    if (target?.matches?.('[name="amountExpression"]') && !String(target.value || '').trim()) {
      target.placeholder = '0';
    }
  });
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[name="amountExpression"]')) {
      formatCalculatorInput(target);
      updateCalculator(target.closest('form'));
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

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('input[name="date"][type="date"]')) {
      const form = target.closest('form');
      const display = form?.querySelector('[name="dateDisplay"]');
      if (display) display.value = target.value ? formatDateDMY(target.value) : '';
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
          ui.txYear = target.value || new Date().getFullYear().toString();
          ui.txPage = 1;
          break;
        case 'tx-month':
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
          if (target.value) ui.budgetMonth = target.value;
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
      if (subcategory) subcategory.innerHTML = subcategoryOptions(target.value);
      return;
    }

    if (target.matches('select[name="accountOwner"]')) {
      const form = target.closest('form[data-form="transaction"]');
      const accountSelect = form?.querySelector('select[name="accountId"]');
      if (accountSelect) {
        const selected = accountSelect.value;
        const owner = target.value || 'all';
        const options = store.data.accounts
          .filter((account) => !account.deletedAt)
          .filter((account) => !account.archived || account.id === selected)
          .filter((account) => owner === 'all' || account.owner === owner)
          .map((account) => `<option value="${escapeAttr(account.id)}" ${selected === account.id ? 'selected' : ''}>${escapeHTML(account.name)}${account.archived ? ' (arsip)' : ''}</option>`)
          .join('');
        accountSelect.innerHTML = options || '<option value="">Tidak ada akun</option>';
        if (selected && ![...accountSelect.options].some((option) => option.value === selected)) {
          accountSelect.selectedIndex = 0;
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
    if (store.currentUser) {
      store.syncFamilyWorkspace().then((result) => {
        if (result?.changed) {
          ui.appMounted = false;
          renderApplication();
        }
      }).catch(() => {});
    }
  }, 3_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.currentUser) {
      store.syncFamilyWorkspace().then((result) => {
        if (result?.changed) {
          ui.appMounted = false;
          renderApplication();
        }
      }).catch(() => {});
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

function boot() {
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
  // Warm up Google Identity Services so the sign-in window can be opened
  // synchronously from the button tap (required by Safari/iOS).
  GoogleDrive.prepare().catch(() => {});

  if (!location.hash) history.replaceState(null, '', '#/dashboard');

  setSplashStatus('Memeriksa sesi...');
  const session = getSession();
  if (session?.workspaceId) {
    const opened = store.openWorkspace(session.workspaceId, { account: store.accountForWorkspace(session.workspaceId) });
    let user = opened ? store.getUser(session.userId) : null;
    if (opened && !user) {
      // The stored session can point at a user id that changed after a cloud
      // sync or an app update. Recover by account e-mail instead of sending
      // the user back to the login screen.
      const account = store.account;
      if (account?.email) user = store.ensureMember(account);
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

  setSplashStatus('Memeriksa pembaruan...');
  registerServiceWorker();

  if (!store.currentUser) {
    renderAuth();
    resumeGoogleLoginOnBoot();
  } else {
    renderApplication();
    runRecurring({ notify: true });
    setTimeout(checkReminders, 1_500);
  }

  setupInstallPrompt();

  if (store.hasWorkspace) {
    Cloud.bootstrap().then(() => {
      if (store.currentUser && !ui.locked) renderApplication();
      else renderAuth();
    }).catch((error) => console.warn('Cloud bootstrap skipped:', error));
  }

  // Hide splash after a short delay to ensure paint
  setTimeout(hideSplash, 600);

  window.__RISLY__ = { store, Cloud, navigate, version: APP.version };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
