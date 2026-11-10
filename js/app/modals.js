/**
 * RISLY Money Manager — Modals.
 */

import { store } from '../core/store.js';
import { Cloud } from '../services/cloud.js';
import { icon } from '../ui/icons.js';
import { escapeAttr, escapeHTML, formatDate, normalizeSearch, monthKey } from '../core/utils.js';
import { money, openModal, toast, prefs, savePrefs, setTheme, ui, closeModal, confirmDialog, emptyState } from '../ui/ui.js';
import { LOCK_OPTIONS, THEME_OPTIONS, WEEK_OPTIONS } from '../core/config.js';
import { syncPaymentSplit } from './payment-split.js';
import { transactionForm, recurringForm } from '../forms/transaction.js';
import { accountForm, categoryForm } from '../forms/account.js';
import { cloudProviderFields } from '../forms/cloud.js';
import { noteEditorForm } from '../forms/note.js';
import { budgetCategoriesModal } from '../views/budgets.js';
import { profileSheet, moreSheet } from '../views/shell.js';
import { tasksSheet } from '../views/notes.js';
import { renderApplication } from './runtime.js';

function openTransactionModal(tx = null, defaults = {}) {
  if (defaults.calcOpen === undefined) ui.calcOpen = false;
  openModal({
    size: 'lg',
    className: 'form-modal',
    labelledBy: 'transaction-modal-title',
    html: transactionForm(tx, { ...defaults, type: defaults.type || tx?.type || 'expense' }),
  });
  syncPaymentSplit(document.querySelector('#modal-root form[data-form="transaction"]'));
}

function openReceiptLightbox(src) {
  const host = document.getElementById('modal-root') || document.body;
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'receipt-lightbox';
  overlay.innerHTML = `<div class="receipt-lightbox-backdrop" data-receipt-lightbox-close></div>
    <figure class="receipt-lightbox-panel" role="dialog" aria-modal="true" aria-label="Foto struk">
      <figcaption class="receipt-lightbox-head">
        <span class="receipt-lightbox-title">Foto struk</span>
        <button type="button" class="icon-btn modal-close" data-receipt-lightbox-close aria-label="Tutup">${icon('x')}</button>
      </figcaption>
      <img src="${escapeAttr(src)}" alt="Struk">
    </figure>`;
  host.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      try { previousFocus.focus({ preventScroll: true }); } catch { /* noop */ }
    }
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  overlay.querySelectorAll('[data-receipt-lightbox-close]').forEach((node) => {
    node.addEventListener('click', close);
  });
  document.addEventListener('keydown', onKey);
  overlay.querySelector('button')?.focus({ preventScroll: true });
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
  openModal({
    size: 'lg',
    className: 'form-modal',
    html: `<div class="modal-body">${budgetCategoriesModal(ui.budgetMonth || monthKey())}</div>`,
  });
}

function openBudgetCategoryAmountLightbox(categoryId, categoryName, amount, month) {
  const host = document.getElementById('modal-root') || document.body;
  const overlay = document.createElement('div');
  overlay.className = 'receipt-lightbox budget-amount-lightbox';
  overlay.innerHTML = `<div class="receipt-lightbox-backdrop" data-budget-amount-close></div>
    <section class="receipt-lightbox-panel budget-amount-panel" role="dialog" aria-modal="true" aria-label="Ubah batas ${escapeAttr(categoryName)}">
      <header class="modal-header">
        <div class="modal-heading">
          <span class="modal-heading-icon" aria-hidden="true">${icon('edit', 'w-4.5 h-4.5')}</span>
          <div class="min-w-0">
            <p class="modal-kicker">Anggaran kategori</p>
            <h2 class="modal-title">Batas ${escapeHTML(categoryName)}</h2>
          </div>
        </div>
        <button type="button" class="icon-btn modal-close" data-budget-amount-close aria-label="Tutup">${icon('x')}</button>
      </header>
      <form class="budget-amount-form">
        <div class="modal-body">
          <label class="field-label">Nominal batas
            <div class="input-with-prefix mt-1.5">
              <span>Rp</span>
              <input class="field" type="text" inputmode="numeric" name="amountDisplay" value="${amount ? String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}" placeholder="0" aria-label="Batas ${escapeAttr(categoryName)}" autocomplete="off">
              <input type="hidden" name="amount" value="${Math.round(amount || 0)}">
            </div>
          </label>
          <p class="text-[11px] text-slate-400 mt-2">Isi 0 untuk menghapus batas.</p>
        </div>
        <footer class="modal-footer">
          <button type="button" class="btn btn-secondary" data-budget-amount-close>Batal</button>
          <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} Simpan</button>
        </footer>
      </form>
    </section>`;
  host.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-budget-amount-close]').forEach((node) => {
    node.addEventListener('click', close);
  });
  const form = overlay.querySelector('form');
  const displayInput = form.querySelector('input[name="amountDisplay"]');
  const hiddenInput = form.querySelector('input[name="amount"]');
  const formatThousands = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  if (displayInput && hiddenInput) {
    displayInput.addEventListener('input', () => {
      const raw = displayInput.value.replace(/\D/g, '');
      hiddenInput.value = raw || '0';
      displayInput.value = formatThousands(raw);
      try { displayInput.setSelectionRange(displayInput.value.length, displayInput.value.length); } catch { /* noop */ }
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = Number(form.amount.value) || 0;
    store.setBudget(month, categoryId, value);
    const updatedStatus = store.budgetStatus(month);
    const newTotal = (updatedStatus.categories || []).reduce((sum, item) => sum + (Number(item.limit) || 0), 0);
    store.setBudget(month, '__total__', newTotal);
    overlay.remove();
    const panel = document.getElementById('modal-root')?.querySelector('.modal-panel');
    if (panel) {
      panel.innerHTML = `<div class="modal-body">${budgetCategoriesModal(month)}</div>`;
      panel.classList.add('modal-in');
    }
    try { renderApplication(); } catch (error) { console.error(error); }
    toast('Batas kategori disimpan.', 'success');
  });
  overlay.querySelector('input[name="amount"]')?.focus({ preventScroll: true });
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

export { openTransactionModal, openReceiptLightbox, openRecurringModal, openAccountModal, openCategoryModal, openNoteEditor, renderGlobalSearchResults, openGlobalSearch, openAutoLockModal, openThemeModal, openWeekModal, openProfileSheet, openMoreSheet, openTasksSheet, openBudgetCategoriesModal, openBudgetCategoryAmountLightbox, openForgotPinModal, openInstallHelp, openJoinWorkspaceModal, authCloudFields, openAuthCloudModal };
