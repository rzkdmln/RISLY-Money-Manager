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
  paymentRowHint,
  paymentRowHtml,
  recurringForm,
  subcategoryOptions,
  transactionForm,
} from './forms/transaction.js';
import { noteEditorForm, todoItemRow } from './forms/note.js';
import { cloudProviderFields } from './forms/cloud.js';
import {
  handleCalculatorKey,
  maskDateInput,
  toggleCalculator,
  updateCalculator,
  formatCalculatorInput,
} from './app/calculator.js';
import {
  addPaymentRow,
  createPaymentRow,
  refreshPaymentRowHint,
  syncPaymentSplit,
} from './app/payment-split.js';
import {
  changeNoteEditorKind,
  collectNotePayload,
  flushNoteAutosave,
  scheduleNoteAutosave,
  setNoteSaveStatus,
} from './app/note-editor.js';
import {
  openTransactionModal,
  openReceiptLightbox,
  openRecurringModal,
  openAccountModal,
  openCategoryModal,
  openNoteEditor,
  renderGlobalSearchResults,
  openGlobalSearch,
  openAutoLockModal,
  openThemeModal,
  openWeekModal,
  openProfileSheet,
  openMoreSheet,
  openTasksSheet,
  openBudgetCategoriesModal,
  openBudgetCategoryAmountLightbox,
  openForgotPinModal,
  openInstallHelp,
  authCloudFields,
  openAuthCloudModal,
} from './app/modals.js';
import { handleAction } from './app/actions/index.js';
import { submitForm } from './app/submissions/index.js';
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
import { appHooks } from './app/hooks.js';

/* -------------------------------------------------------------------------- */
/*  Runtime state                                                            */
/* -------------------------------------------------------------------------- */

export const root = document.getElementById('app-root');
let renderTimer = null;
export let noteSaveTimer = null;
let deferredInstallPrompt = null;
export let swRegistration = null;
export let lastActivityWrite = 0;
let lastReminderCheck = 0;

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

export function showFormError(form, message) {
  const node = form?.querySelector('[data-form-error]');
  if (!node) {
    toast(message, 'error');
    return;
  }
  node.textContent = message;
  node.classList.remove('hidden');
  node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function clearFormError(form) {
  const node = form?.querySelector('[data-form-error]');
  if (node) {
    node.textContent = '';
    node.classList.add('hidden');
  }
}

function sameColor(first, second) {
  return String(first || '').toLowerCase() === String(second || '').toLowerCase();
}

export function applyColorFieldValue(field, color) {
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

export function refreshColorField(field) {
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

export function setColorFieldBase(field, color) {
  if (!field || !color) return;
  field.dataset.colorBase = color;
  const custom = field.querySelector('[data-color-custom]');
  if (custom && !sameColor(custom.value, color)) custom.value = color;
  const hidden = field.querySelector('input[name="color"]');
  if (hidden) hidden.value = color;
  refreshColorField(field);
}

export function formValue(form, name) {
  return new FormData(form).get(name);
}

export function stringValue(form, name) {
  return String(formValue(form, name) ?? '').trim();
}

export function rememberFocus() {
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

export function scheduleRender(delay = 60) {
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

export function lockApplication({ expired = false } = {}) {
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

export async function leaveApplication() {
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

export function checkAutoLock() {
  const session = getSession();
  if (!session || !store.currentUser) return;
  if (isSessionExpired(session, store.data.settings.autoLockMinutes)) {
    lockApplication({ expired: true });
  }
}

export function runRecurring({ notify = false } = {}) {
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

export function checkReminders() {
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
/*  Cloud config                                                             */
/* -------------------------------------------------------------------------- */

export function parseCloudConfig(form) {
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

export function openJoinWorkspaceModal() {
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

export async function submitJoinWorkspace(form) {
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

export async function connectCloudFromForm(form) {
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

export async function testCloudFromForm(form) {
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

export async function createJsonBinFromForm(form) {
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

export function openNativeDatePicker(wrap) {
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

/* -------------------------------------------------------------------------- */
/*  Form submissions                                                         */
/* -------------------------------------------------------------------------- */

export async function submitLogin(form) {
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

export function submitTransaction(form) {
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

  const makePaymentSplit = fd.get('makePaymentSplit') === '1';
  const paymentRows = makePaymentSplit ? Array.from(form.querySelectorAll('[data-payment-row]')) : [];
  const payments = paymentRows.map((row) => {
    const paymentAccountId = String(row.querySelector('[name="paymentAccount"]')?.value || '');
    const account = store.accountById(paymentAccountId);
    return {
      accountId: paymentAccountId,
      memberId: account?.owner || null,
      amount: Math.round(Number(row.querySelector('[name="paymentAmount"]')?.value || 0)),
    };
  }).filter((payment) => payment.accountId || payment.amount > 0);

  let paymentTotal = 0;
  if (makePaymentSplit) {
    if (payments.length < 2) {
      showFormError(form, 'Split pembayaran membutuhkan minimal dua akun.');
      return;
    }
    if (payments.some((payment) => !payment.accountId)) {
      showFormError(form, 'Pilih akun untuk setiap baris pembayaran.');
      return;
    }
    if (payments.some((payment) => payment.amount <= 0)) {
      showFormError(form, 'Isi nominal lebih dari nol untuk setiap akun.');
      return;
    }
    const uniqueAccounts = new Set(payments.map((payment) => payment.accountId));
    if (uniqueAccounts.size !== payments.length) {
      showFormError(form, 'Setiap akun hanya boleh dipakai satu kali dalam split pembayaran.');
      return;
    }
    if (amount === null || amount <= 0) {
      showFormError(form, 'Nominal transaksi harus lebih dari nol.');
      return;
    }
    paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (paymentTotal !== Math.round(amount)) {
      showFormError(form, `Total split (${formatCurrency(paymentTotal, { hide: false })}) belum sesuai dengan nominal transaksi (${formatCurrency(Math.round(amount), { hide: false })}).`);
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
  if (!makePaymentSplit && !accountId) {
    showFormError(form, 'Pilih akun sumber dana.');
    return;
  }
  if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
    showFormError(form, 'Pilih akun tujuan yang berbeda dari akun sumber.');
    return;
  }
  if (type !== 'transfer' && !categoryId && !originalTransaction?.adjustment) {
    showFormError(form, 'Pilih kategori transaksi.');
    return;
  }
  if (type === 'expense') {
    const checkParts = makePaymentSplit ? payments : [{ accountId, amount }];
    for (const part of checkParts) {
      const account = store.accountById(part.accountId);
      if (account?.type !== 'credit') continue;
      const creditLimit = safeNumber(account.creditLimit);
      if (!(creditLimit > 0)) continue;
      const spentSoFar = store.creditSpent(account.id);
      const remainingLimit = Math.max(0, creditLimit - spentSoFar);
      if (part.amount > remainingLimit) {
        showFormError(form, `Nominal dari akun ${account.name} melebihi sisa limit kredit (sisa ${formatCurrency(remainingLimit)}).`);
        return;
      }
    }
  }

  const finalAmount = Math.round(makePaymentSplit ? paymentTotal : amount);
  const originalSplits = Array.isArray(originalTransaction?.splits) ? originalTransaction.splits : [];
  const originalSplitTotal = originalSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  const keepLegacySplits = type !== 'transfer'
    && !makePaymentSplit
    && originalSplits.length > 0
    && originalSplitTotal === finalAmount
    && (originalTransaction?.categoryId || null) === (categoryId || null);

  const receiptValue = String(fd.get('receipt') || '').trim();

  const payload = {
    date,
    time,
    type,
    amount: finalAmount,
    accountId: makePaymentSplit ? payments[0].accountId : accountId,
    toAccountId: type === 'transfer' ? toAccountId : null,
    categoryId: type === 'transfer' ? null : (categoryId || null),
    subcategoryId: type === 'transfer' ? null : (subcategoryId || null),
    note: String(fd.get('note') || '').trim(),
    payee: String(fd.get('payee') || '').trim(),
    tags: String(fd.get('tags') || '')
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 20),
    payments: makePaymentSplit ? payments : [],
    splits: keepLegacySplits ? originalSplits : [],
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

export function submitRecurring(form) {
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

export function submitGoal(form) {
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

export function submitAccount(form) {
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

export function submitCategory(form) {
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

export function submitSubcategory(form) {
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

export async function submitChangePin(form) {
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

export function submitProfile(form) {
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

export async function submitNote(form) {
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

export function submitBudgetTotal(form) {
  const amount = Number(formValue(form, 'amount')) || 0;
  store.setBudget(ui.budgetMonth || monthKey(), '__total__', amount);
  toast('Total anggaran disimpan.', 'success');
  renderApplication();
}

export function syncBudgetAllocHint(form) {
  if (!form) return;
  const totalInput = form.querySelector('[name="total"]');
  if (!totalInput) return;
  let allocated = 0;
  form.querySelectorAll('input[name^="budget_"]').forEach((input) => {
    allocated += Number(input.value || 0) || 0;
  });
  totalInput.value = String(Math.round(allocated));
}
export function submitBudgetCategories(form) {
  const entries = {};
  new FormData(form).forEach((value, key) => {
    if (key.startsWith('budget_')) entries[key.slice(7)] = Number(value) || 0;
  });
  const warning = Number(formValue(form, 'warning'));
  const danger = Number(formValue(form, 'danger'));
  const hasThresholds = form.querySelector('[name="warning"]') && form.querySelector('[name="danger"]');
  if (hasThresholds) {
    if (!Number.isFinite(warning) || !Number.isFinite(danger) || warning < 1 || danger > 100 || danger <= warning) {
      showFormError(form, 'Ambang bahaya harus lebih besar dari peringatan (1–100%).');
      return;
    }
    store.updateSettings({ budgetWarning: warning, budgetDanger: danger });
  }
  entries.__total__ = Object.keys(entries).reduce((sum, key) => sum + (Number(entries[key]) || 0), 0);
  store.setBudgets(ui.budgetMonth || monthKey(), entries);
  toast('Anggaran disimpan.', 'success');
  closeModal({ silent: true });
  renderApplication();
}

export function submitBudgetThresholds(form) {
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

export function submitHousehold(form) {
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

/* -------------------------------------------------------------------------- */
/*  Notifications & PWA                                                      */
/* -------------------------------------------------------------------------- */

export async function requestNotifications() {
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

export async function checkForUpdate() {
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
      syncPaymentSplit(target.closest('form'));
      return;
    }
    if (target.matches('[data-payment-row] [name="paymentAmount"]')) {
      syncPaymentSplit(target.closest('form'));
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
    const budgetForm = target.closest('form[data-form="budget-categories"]');
    if (budgetForm && (target.name === 'total' || String(target.name || '').startsWith('budget_'))) {
      syncBudgetAllocHint(budgetForm);
    }
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
    if (target.matches('select[name="paymentAccount"]')) {
      const row = target.closest('[data-payment-row]');
      refreshPaymentRowHint(row);
      syncPaymentSplit(target.closest('form'));
      return;
    }
    if (target.matches('input[data-receipt-file]')) {
      const form = target.closest('form');
      const hidden = form?.querySelector('input[name="receipt"]');
      const preview = form?.querySelector('[data-receipt-preview]');
      const wrap = form?.querySelector('[data-receipt-wrap]');
      const uploadWrap = form?.querySelector('[data-receipt-upload]');
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
          if (fileName) fileName.textContent = file.name;
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
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
        const extra = target.closest('.option-box')?.querySelector('.recurring-extra');
        if (extra) extra.hidden = !target.checked;
      }
      if (target.matches('[data-toggle-payment-split]')) {
        const form = target.closest('form');
        const section = form?.querySelector('.payment-split-section');
        if (section) section.hidden = !target.checked;
        const singleAccount = form?.querySelector('[data-single-account]');
        if (singleAccount) singleAccount.classList.toggle('hidden', target.checked);
        if (target.checked) {
          const container = form?.querySelector('[data-payment-rows]');
          while (container && container.querySelectorAll('[data-payment-row]').length < 2) {
            container.appendChild(createPaymentRow({}));
          }
          const rows = [...(container?.querySelectorAll('[data-payment-row]') || [])];
          const hasAmount = rows.some((row) => Number(row.querySelector('[name="paymentAmount"]')?.value || 0) > 0);
          const current = expressionResult(form.querySelector('[name="amountExpression"]')?.value);
          if (!hasAmount && current && current > 0 && rows[0]) {
            const amountInput = rows[0].querySelector('[name="paymentAmount"]');
            if (amountInput) amountInput.value = String(Math.round(current));
          }
          const accountId = form.querySelector('select[name="accountId"]')?.value;
          if (accountId && rows[0]) {
            const accountSelect = rows[0].querySelector('[name="paymentAccount"]');
            if (accountSelect && !accountSelect.value) accountSelect.value = accountId;
          }
        }
        syncPaymentSplit(form);
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

export const debounceSearch = debounce((callback) => callback(), 280);

export function noteActivity() {
  if (!store.currentUser) return;
  const now = Date.now();
  if (now - lastActivityWrite < 30_000) return;
  lastActivityWrite = now;
  updateSessionActivity();
}

/* -------------------------------------------------------------------------- */
/*  Boot                                                                     */
/* -------------------------------------------------------------------------- */

Object.assign(appHooks, {
  enterApplication,
  renderApplication,
  renderAuth,
  signInWithGoogleFlow,
});

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
