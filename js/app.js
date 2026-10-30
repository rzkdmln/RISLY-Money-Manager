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
  debounce,
  downloadBlob,
  downloadJSON,
  escapeAttr,
  escapeHTML,
  expressionResult,
  fileSafe,
  formatCurrency,
  formatDate,
  formatMonth,
  getInitials,
  isIos,
  isStandalone,
  localDateISO,
  monthKey,
  nowISO,
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
import { loginView, setupView } from './views/auth.js';
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
    if (store.currentUser) renderApplication();
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
  if (!user) {
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
  createSession(user.id);
  renderApplication();
  if (fresh) toast(`Selamat datang, ${user.name}.`, 'success');
  runRecurring({ notify: true });
  setTimeout(checkReminders, 1_200);
}

function lockApplication({ expired = false } = {}) {
  clearSession();
  store.setCurrentUser(null);
  ui.currentUser = null;
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
  toast('Anda sudah keluar dari sesi.', 'info');
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
  const provider = config.provider || 'jsonbin';
  const jsonbin = config.jsonbin || {};
  const supabase = config.supabase || {};
  const firebase = config.firebase || {};
  return `<div class="cloud-provider-select">
    <label class="field-label">Penyedia
      <select class="field mt-1.5" name="provider" data-action="cloud-provider-change">
        ${Object.entries(CLOUD_PROVIDERS).filter(([id]) => id !== 'local').map(([id, item]) => `<option value="${id}" ${provider === id ? 'selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}
      </select>
    </label>
    <p class="text-[11px] leading-5 text-slate-500 dark:text-slate-400" data-cloud-help>${escapeHTML(CLOUD_PROVIDERS[provider]?.description || '')}</p>
  </div>
  <div class="cloud-fields" data-provider-section="jsonbin" ${provider === 'jsonbin' ? '' : 'hidden'}>
    <label class="field-label">Bin ID
      <input class="field mt-1.5" name="jsonbinBinId" value="${escapeAttr(jsonbin.binId || '')}" placeholder="65f…">
    </label>
    <label class="field-label">Master Key
      <input class="field mt-1.5" name="jsonbinMasterKey" type="password" value="${escapeAttr(jsonbin.masterKey || '')}" placeholder="$2a$10$…" autocomplete="off">
    </label>
  </div>
  <div class="cloud-fields" data-provider-section="supabase" ${provider === 'supabase' ? '' : 'hidden'}>
    <label class="field-label">Project URL
      <input class="field mt-1.5" name="supabaseUrl" value="${escapeAttr(supabase.url || '')}" placeholder="https://xxxx.supabase.co">
    </label>
    <label class="field-label">Anon key
      <input class="field mt-1.5" name="supabaseAnonKey" type="password" value="${escapeAttr(supabase.anonKey || '')}" placeholder="eyJhbGciOi…" autocomplete="off">
    </label>
    <div class="grid grid-cols-2 gap-3">
      <label class="field-label">Tabel
        <input class="field mt-1.5" name="supabaseTable" value="${escapeAttr(supabase.table || 'households')}">
      </label>
      <label class="field-label">Row ID
        <input class="field mt-1.5" name="supabaseRowId" value="${escapeAttr(supabase.rowId || APP.householdId)}">
      </label>
    </div>
  </div>
  <div class="cloud-fields" data-provider-section="firebase" ${provider === 'firebase' ? '' : 'hidden'}>
    <label class="field-label">Konfigurasi Firebase (JSON)
      <textarea class="field textarea mt-1.5 font-mono text-[11px]" name="firebaseConfigJson" rows="5" placeholder='{"databaseURL":"https://….firebaseio.com","projectId":"…"}'>${escapeHTML(typeof firebase.configJson === 'string' ? firebase.configJson : JSON.stringify(firebase.configJson || {}, null, 2))}</textarea>
    </label>
    <label class="field-label">Path database
      <input class="field mt-1.5" name="firebasePath" value="${escapeAttr(firebase.path || `households/${APP.householdId}`)}">
    </label>
  </div>`;
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
        <p class="text-sm leading-6 text-slate-500 dark:text-slate-400">Pilih backend yang sudah berisi data keluarga. Setelah terhubung, PIN dan data akan ditarik dari cloud, lalu Anda bisa masuk seperti biasa.</p>
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

function handleCalculatorKey(button) {
  const form = button.closest('form');
  const input = form?.querySelector('[name="amountExpression"]');
  if (!input) return;
  const key = button.dataset.calcKey;
  let value = input.value;

  if (key === 'clear') value = '';
  else if (key === 'back') value = value.slice(0, -1);
  else if (key === '=') {
    const result = expressionResult(value);
    if (result === null) {
      toast('Ekspresi belum valid.', 'error');
      input.focus();
      return;
    }
    value = String(Math.round(result * 100) / 100);
  } else if (key === '000') {
    if (!value || /[+\-*/×÷]$/.test(value)) value += '0';
    else value += '000';
  } else if (['+', '−', '×', '÷'].includes(key)) {
    if (!value) value = '0';
    if (/[+\-*/×÷]$/.test(value)) value = value.slice(0, -1);
    value += key;
  } else {
    value += key;
  }

  input.value = value;
  updateCalculator(form);
  input.focus({ preventScroll: true });
  try { input.setSelectionRange(value.length, value.length); } catch { /* noop */ }
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
    title: 'Reset seluruh aplikasi?',
    message: 'Semua data lokal, PIN, pengaturan, dan koneksi cloud akan dihapus dari perangkat ini. Data yang sudah terlanjur tersinkron di cloud tidak ikut dihapus.',
    confirmLabel: 'Reset sekarang',
    danger: true,
    iconName: 'alert-triangle',
  });
  if (!ok) return;
  try { await Cloud.disconnect(); } catch { /* noop */ }
  clearSession();
  store.resetLocalData();
  ui.currentUser = null;
  ui.selectedUser = null;
  ui.locked = false;
  ui.appMounted = false;
  closeModal({ silent: true });
  renderAuth();
  toast('Aplikasi sudah direset. Buat PIN baru untuk memulai.', 'info');
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

async function handleAction(action, element) {
  const id = element.dataset.id;
  switch (action) {
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
        date: fd.get('date') || todayISO(),
        amount: amount === null ? '' : String(Math.round(amount * 100) / 100),
        accountId: fd.get('accountId') || '',
        toAccountId: fd.get('toAccountId') || '',
        categoryId: fd.get('categoryId') || '',
        subcategoryId: fd.get('subcategoryId') || '',
        note: fd.get('note') || '',
        recurring: Boolean(fd.get('makeRecurring')),
        recurringTitle: fd.get('recurringTitle') || '',
        frequency: fd.get('recurringFrequency') || 'monthly',
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
      ui.txLimit = 40;
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
      ui.txMonth = 'all';
      ui.txLimit = 40;
      renderApplication();
      break;
    case 'reset-tx-filter':
      ui.txMonth = monthKey();
      ui.txType = 'all';
      ui.txAccount = 'all';
      ui.txCategory = 'all';
      ui.txUser = 'all';
      ui.txQuery = '';
      ui.txLimit = 40;
      renderApplication();
      break;
    case 'tx-load-more':
      ui.txLimit += 40;
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
      enterApplication(user, { fresh: true });
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

async function submitSetup(form) {
  const householdName = stringValue(form, 'householdName') || 'Rizki & Shelly';
  if (!form.querySelector('[name="acknowledge"]')?.checked) {
    showFormError(form, 'Centang pernyataan keamanan untuk melanjutkan.');
    return;
  }

  const users = store.activeUsers();
  const pending = users.filter((user) => form.querySelector(`[name="pin_${user.id}"]`));
  if (!pending.length) {
    showFormError(form, 'Tidak ada pengguna yang perlu disiapkan.');
    return;
  }

  const prepared = [];
  for (const user of pending) {
    const pin = String(formValue(form, `pin_${user.id}`) || '');
    const confirm = String(formValue(form, `confirm_${user.id}`) || '');
    if (!/^\d{4,8}$/.test(pin)) {
      showFormError(form, `PIN ${user.name} harus 4–8 angka.`);
      return;
    }
    if (pin !== confirm) {
      showFormError(form, `PIN ${user.name} dan ulangannya tidak sama.`);
      return;
    }
    prepared.push({ user, pin });
  }

  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  suppressRender = true;
  try {
    for (const { user, pin } of prepared) {
      const credentials = await createPinCredentials(pin);
      store.updateUser(user.id, credentials);
    }
    store.updateSettings({ householdName });
    const first = store.getUser(prepared[0].user.id) || store.activeUsers()[0];
    suppressRender = false;
    toast('PIN berhasil dibuat. Ruang keuangan kalian siap.', 'success');
    enterApplication(first);
  } catch (error) {
    console.error(error);
    showFormError(form, error.message || 'Gagal membuat PIN.');
  } finally {
    suppressRender = false;
    if (submit) submit.disabled = false;
  }
}

function submitTransaction(form) {
  const fd = new FormData(form);
  const editingId = form.dataset.id;
  const type = String(fd.get('type') || 'expense');
  const amount = expressionResult(fd.get('amountExpression'));
  const date = String(fd.get('date') || todayISO());
  const accountId = String(fd.get('accountId') || '');
  const toAccountId = String(fd.get('toAccountId') || '');
  const categoryId = String(fd.get('categoryId') || '');
  const subcategoryId = String(fd.get('subcategoryId') || '');

  if (amount === null || amount <= 0) {
    showFormError(form, 'Nominal harus lebih dari nol. Gunakan angka atau ekspresi seperti 250000+50000.');
    return;
  }
  if (!date) {
    showFormError(form, 'Tanggal transaksi wajib diisi.');
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
    showFormError(form, 'Nama keluarga wajib diisi.');
    return;
  }
  store.updateSettings({
    householdName,
    defaultMonthlyBudget: Number(formValue(form, 'defaultMonthlyBudget')) || 0,
  });
  toast('Identitas rumah tangga disimpan.', 'success');
  renderApplication();
}

async function submitForm(form) {
  clearFormError(form);
  const type = form.dataset.form;
  switch (type) {
    case 'login':
      await submitLogin(form);
      break;
    case 'setup':
      await submitSetup(form);
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
              worker.postMessage({ type: 'SKIP_WAITING' });
              setTimeout(() => location.reload(), 400);
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

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[name="amountExpression"]')) {
      updateCalculator(target.closest('form'));
      return;
    }
    if (target.id === 'tx-search') {
      ui.txQuery = target.value;
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
          ui.txLimit = 40;
          break;
        case 'tx-month':
          ui.txMonth = target.value || 'all';
          ui.txLimit = 40;
          break;
        case 'tx-type':
          ui.txType = target.value || 'all';
          ui.txLimit = 40;
          break;
        case 'tx-account':
          ui.txAccount = target.value || 'all';
          ui.txLimit = 40;
          break;
        case 'tx-category':
          ui.txCategory = target.value || 'all';
          ui.txLimit = 40;
          break;
        case 'tx-user':
          ui.txUser = target.value || 'all';
          ui.txLimit = 40;
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
  }, 30_000);
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

  store.init();
  Cloud.init(store);
  bindStore();
  bindEvents();

  if (!location.hash) history.replaceState(null, '', '#/dashboard');

  const session = getSession();
  if (session) {
    const user = store.getUser(session.userId);
    const expired = isSessionExpired(session, store.data.settings.autoLockMinutes);
    if (!expired && user?.pinHash) {
      store.setCurrentUser(user.id);
      ui.currentUser = user;
      ui.selectedUser = user.id;
      updateSessionActivity();
    } else {
      clearSession();
      ui.locked = Boolean(expired);
    }
  }

  if (!store.currentUser) {
    const available = store.activeUsers().filter((user) => user.pinHash);
    ui.selectedUser = prefs.lastUser && available.some((user) => user.id === prefs.lastUser)
      ? prefs.lastUser
      : available[0]?.id || null;
    renderAuth();
  } else {
    renderApplication();
    runRecurring({ notify: true });
    setTimeout(checkReminders, 1_500);
  }

  hideSplash();
  registerServiceWorker();
  setupInstallPrompt();

  Cloud.bootstrap().then(() => {
    if (store.currentUser) renderApplication();
    else renderAuth();
  }).catch((error) => console.warn('Cloud bootstrap skipped:', error));

  window.__RISLY__ = { store, Cloud, navigate, version: APP.version };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
