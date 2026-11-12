/**
 * RISLY Money Manager — Modals.
 */

import { store } from '../core/store.js';
import { Cloud } from '../services/cloud.js';
import { icon } from '../ui/icons.js';
import { escapeAttr, escapeHTML, formatDate, normalizeSearch, monthKey } from '../core/utils.js';
import {
  money,
  openModal,
  toast,
  prefs,
  savePrefs,
  setTheme,
  ui,
  closeModal,
  confirmDialog,
  emptyState,
} from '../ui/ui.js';
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

  // Muat pratinjau struk dari IndexedDB (object URL) setelah modal dibuka.
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) {
    modalRoot.querySelectorAll('[data-receipt-wrap][data-receipt-id]').forEach(async (wrap) => {
      const receiptId = wrap.dataset.receiptId;
      const img = wrap.querySelector('img[data-receipt-preview]');
      if (!receiptId || !img) return;
      try {
        const url = await store.getReceiptUrl(receiptId);
        if (url) img.src = url;
      } catch (error) {
        console.warn('Gagal memuat pratinjau struk:', error);
      }
    });
  }
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
      try {
        previousFocus.focus({ preventScroll: true });
      } catch {
        /* noop */
      }
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
  if (!q)
    return '<p class="text-sm text-slate-500 dark:text-slate-400">Ketik untuk mencari transaksi, catatan, akun, dan kategori.</p>';
  const txs = store
    .transactions()
    .filter((tx) => {
      const cat = store.categoryById(tx.categoryId);
      const acc = store.accountById(tx.accountId);
      return normalizeSearch([tx.note, cat?.name, acc?.name, tx.createdByName]).includes(q);
    })
    .slice(0, 8);
  const notes = (store.notes?.() || [])
    .filter((note) => normalizeSearch([note.title, note.content]).includes(q))
    .slice(0, 6);
  const accounts = store
    .activeAccounts()
    .filter((acc) => normalizeSearch(acc.name).includes(q))
    .slice(0, 6);
  const categories = store
    .categories('expense')
    .concat(store.categories('income'))
    .filter((cat) => normalizeSearch(cat.name).includes(q))
    .slice(0, 6);

  let html = '';
  if (txs.length) {
    html +=
      '<div class="space-y-1 mb-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Transaksi</p>' +
      txs
        .map(
          (tx) =>
            `<button type="button" class="tx-row" data-action="global-open" data-type="tx" data-id="${escapeAttr(tx.id)}"><span class="tx-main"><span class="tx-title">${escapeHTML(tx.note || store.categoryById(tx.categoryId)?.name || 'Transaksi')}</span><span class="tx-meta">${escapeHTML(formatDate(tx.date))} · ${escapeHTML(store.accountName(tx.accountId))}</span></span><span class="tx-amount ${tx.type === 'income' ? 'amount-income' : tx.type === 'expense' ? 'amount-expense' : 'amount-transfer'}">${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${money(tx.amount)}</span></button>`
        )
        .join('') +
      '</div>';
  }
  if (notes.length) {
    html +=
      '<div class="space-y-1 mb-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Catatan</p>' +
      notes
        .map(
          (note) =>
            `<button type="button" class="settings-row" data-action="global-open" data-type="note" data-id="${escapeAttr(note.id)}"><span class="flex-1"><strong>${escapeHTML(note.title)}</strong><small>${escapeHTML(note.kind === 'todo' ? 'Tugas' : 'Catatan')}</small></span></button>`
        )
        .join('') +
      '</div>';
  }
  if (accounts.length) {
    html +=
      '<div class="space-y-1 mb-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Akun</p>' +
      accounts
        .map(
          (acc) =>
            `<button type="button" class="settings-row" data-action="global-open" data-type="account" data-id="${escapeAttr(acc.id)}"><span class="flex-1"><strong>${escapeHTML(acc.name)}</strong><small>${escapeHTML(acc.type)}</small></span></button>`
        )
        .join('') +
      '</div>';
  }
  if (categories.length) {
    html +=
      '<div class="space-y-1 mb-4"><p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Kategori</p>' +
      categories
        .map(
          (cat) =>
            `<button type="button" class="settings-row" data-action="global-open" data-type="category" data-id="${escapeAttr(cat.id)}"><span class="flex-1"><strong>${escapeHTML(cat.name)}</strong><small>${escapeHTML(cat.type || '')}</small></span></button>`
        )
        .join('') +
      '</div>';
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
          ${THEME_OPTIONS.map(
            (
              option
            ) => `<button type="button" class="theme-option ${prefs.theme === option.id ? 'is-active' : ''}" data-action="theme-set" data-theme="${option.id}">
            ${icon(option.icon, 'w-4 h-4')}<span>${escapeHTML(option.label)}</span>
          </button>`
          ).join('')}
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
  openModal({
    size: 'md',
    className: 'sheet-panel modal-center profile-sheet',
    html: profileSheet(store.currentUser),
  });
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
      try {
        displayInput.setSelectionRange(displayInput.value.length, displayInput.value.length);
      } catch {
        /* noop */
      }
    });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = Number(form.amount.value) || 0;
    // Tunggu penyimpanan selesai agar budgetStatus tidak membaca data lama
    // (race condition yang menyebabkan edit kategori hilang/revert).
    await store.setBudget(month, categoryId, value);
    const updatedStatus = store.budgetStatus(month);
    const newTotal = (updatedStatus.categories || []).reduce(
      (sum, item) => sum + (Number(item.limit) || 0),
      0
    );
    await store.setBudget(month, '__total__', newTotal);
    overlay.remove();
    const panel = document.getElementById('modal-root')?.querySelector('.modal-panel');
    if (panel) {
      panel.innerHTML = `<div class="modal-body">${budgetCategoriesModal(month)}</div>`;
      panel.classList.add('modal-in');
    }
    try {
      renderApplication();
    } catch (error) {
      console.error(error);
    }
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

function annuityPayment(principal, annualRate, months) {
  const p = Math.max(0, Number(principal) || 0);
  const n = Math.max(0, Math.round(Number(months) || 0));
  if (p <= 0 || n <= 0) return 0;
  const i = (Number(annualRate) || 0) / 100 / 12;
  if (i === 0) return p / n;
  return (p * i) / (1 - Math.pow(1 + i, -n));
}

function amortizationSchedule(account) {
  const principal = Math.max(0, Number(account.loanPrincipal) || 0);
  const rate = Math.max(0, Number(account.loanInterestRate) || 0);
  const months = Math.max(0, Math.round(Number(account.loanTermMonths) || 0));
  let payment = Math.max(0, Number(account.loanMonthlyPayment) || 0);
  if (payment <= 0) payment = annuityPayment(principal, rate, months);
  const rows = [];
  let balance = principal;
  const totalMonths = months > 0 ? months : 360;
  for (let m = 1; m <= totalMonths && balance > 0.005; m += 1) {
    const interest = balance * (rate / 100 / 12);
    let principalPaid = payment - interest;
    if (principalPaid > balance) principalPaid = balance;
    if (principalPaid < 0) principalPaid = 0;
    balance = Math.max(0, balance - principalPaid);
    rows.push({ month: m, payment, interest, principal: principalPaid, balance });
    if (balance <= 0.005) break;
  }
  return { payment, rows };
}

function openLoanScheduleModal(accountId) {
  const account = store.accountById(accountId);
  if (!account) return;
  const { payment, rows } = amortizationSchedule(account);
  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);
  const bodyRows = rows
    .map(
      (row) => `
    <tr>
      <td>${row.month}</td>
      <td class="text-right">${money(Math.round(row.payment))}</td>
      <td class="text-right">${money(Math.round(row.interest))}</td>
      <td class="text-right">${money(Math.round(row.principal))}</td>
      <td class="text-right">${money(Math.round(row.balance))}</td>
    </tr>`
    )
    .join('');

  openModal({
    size: 'lg',
    className: 'form-modal',
    html: `<div class="modal-form">
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Jadwal anuitas</p>
          <h2 class="modal-title">${escapeHTML(account.name)}</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
          <div class="stat-card stat-blue"><div class="stat-top"><span>Pokok</span></div><div class="stat-value text-base">${money(account.loanPrincipal)}</div></div>
          <div class="stat-card stat-amber"><div class="stat-top"><span>Bunga</span></div><div class="stat-value text-base">${escapeHTML(String(account.loanInterestRate || 0))}%</div></div>
          <div class="stat-card stat-green"><div class="stat-top"><span>Cicilan/bln</span></div><div class="stat-value text-base">${money(Math.round(payment))}</div></div>
          <div class="stat-card stat-red"><div class="stat-top"><span>Total bunga</span></div><div class="stat-value text-base">${money(Math.round(totalInterest))}</div></div>
        </div>
        <div class="max-h-[50vh] overflow-auto border rounded">
          <table class="report-table text-xs">
            <thead><tr><th>Bulan</th><th class="text-right">Cicilan</th><th class="text-right">Bunga</th><th class="text-right">Pokok</th><th class="text-right">Sisa</th></tr></thead>
            <tbody>${bodyRows || '<tr><td colspan="5" class="text-center text-slate-400">Tidak ada jadwal.</td></tr>'}</tbody>
          </table>
        </div>
        <p class="text-[11px] text-slate-400 mt-2">Jadwal dihitung dengan rumus anuitas. Pembayaran aktual dapat berbeda karena biaya/penalti.</p>
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Tutup</button>
      </footer>
    </div>`,
  });
}

function openPrivacyModal() {
  openModal({
    size: 'xl',
    className: 'form-modal',
    html: `
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Keamanan & Privasi</p>
          <h2 class="modal-title">Kebijakan Privasi</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body p-4 overflow-y-auto max-h-[70vh]">
        <div class="privacy-content">
          <p class="text-[11px] text-slate-500 mb-4">Terakhir diperbarui: 12 November 2026</p>

          <p class="text-sm mb-3">Kebijakan Privasi ini menjelaskan bagaimana <strong>RISLY Money Manager</strong> ("kami") mengumpulkan, menggunakan, dan melindungi informasi pribadi Anda saat menggunakan aplikasi ini.</p>

          <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg p-3 mb-4">
            <p class="text-xs font-bold text-amber-800 dark:text-amber-200 mb-1">Penting:</p>
            <p class="text-xs text-amber-700 dark:text-amber-300">RISLY Money Manager adalah aplikasi Progressive Web App (PWA) yang berjalan sepenuhnya di browser Anda. Data keuangan utama disimpan <strong>secara lokal di perangkat Anda</strong> (IndexedDB dan localStorage), <strong>bukan</strong> di server kami. Kami tidak memiliki server backend yang menyimpan data transaksi Anda.</p>
          </div>

          <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 mt-4">1. Informasi yang Kami Kumpulkan</h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 mb-1">Jika Anda memilih untuk masuk menggunakan Google Sign-In, kami hanya menerima informasi dasar dari akun Google Anda melalui Firebase Authentication, meliputi:</p>
          <ul class="list-disc list-inside text-xs text-slate-600 dark:text-slate-400 mb-3 space-y-1">
            <li>Nama lengkap</li>
            <li>Alamat email</li>
            <li>Foto profil (URL gambar profil)</li>
          </ul>
          <p class="text-xs text-slate-600 dark:text-slate-400 mb-3">Informasi ini digunakan hanya untuk mengidentifikasi dan memverifikasi identitas Anda saat masuk, serta menampilkan profil di dalam dasbor aplikasi. Kami <strong>tidak menyimpan</strong> data ini di server kami.</p>

          <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 mt-4">2. Data Keuangan &amp; Penyimpanan Lokal</h3>
          <ul class="list-disc list-inside text-xs text-slate-600 dark:text-slate-400 mb-3 space-y-1">
            <li>Semua data transaksi, akun, kategori, anggaran, catatan, dan target keuangan disimpan <strong>secara lokal di perangkat Anda</strong> melalui IndexedDB dan localStorage.</li>
            <li>Foto struk disimpan sebagai blob di IndexedDB (tidak sebagai base64 di dalam data workspace).</li>
            <li>Jika Anda mengatur PIN, data lokal di-enkripsi <strong>at-rest</strong> menggunakan AES-GCM 256-bit dengan kunci yang di-derive dari PIN (PBKDF2-SHA256, 310.000 iterasi). Kunci enkripsi hanya ada di memori aplikasi dan <strong>tidak pernah disimpan ke disk</strong>.</li>
            <li>Sesi login disimpan di sessionStorage + metadata IndexedDB (tidak ada cookie sensitif). Token Google Drive tidak disimpan di cookie yang bisa dibaca JavaScript.</li>
          </ul>

          <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 mt-4">3. Sinkronisasi Cloud &amp; Ruang Keluarga (Opsional)</h3>
          <ul class="list-disc list-inside text-xs text-slate-600 dark:text-slate-400 mb-3 space-y-1">
            <li>Sinkronisasi cloud melalui <strong>Firebase Realtime Database</strong> adalah fitur opsional dan hanya aktif jika Anda mengonfigurasinya sendiri.</li>
            <li>Data yang di-sinkronkan ke Firebase meliputi data workspace (JSON), <strong>bukan</strong> file foto struk asli.</li>
            <li>Berbagi keluarga dilakukan melalui kode undangan. Pemetaan keanggotaan disimpan di cloud agar akun yang sama di perangkat berbeda masuk ke rumah tangga yang sama.</li>
            <li>Anda dapat berhenti menggunakan sinkronisasi cloud kapan saja melalui Pengaturan aplikasi.</li>
          </ul>

          <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 mt-4">4. Google Drive (Opsional)</h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 mb-3">Google Drive hanya digunakan untuk login dan backup manual (file JSON terenkripsi ke folder appDataFolder, maksimal 10 backup terbaru). Tidak ada sinkronisasi otomatis ke Google Drive. Token Google Drive tidak disimpan di cookie.</p>

          <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 mt-4">5. Perlindungan &amp; Keamanan Data</h3>
          <ul class="list-disc list-inside text-xs text-slate-600 dark:text-slate-400 mb-3 space-y-1">
            <li>Kami <strong>TIDAK AKAN PERNAH</strong> menjual, menyewakan, atau membagikan informasi pribadi maupun data keuangan Anda kepada pihak ketiga untuk keperluan pemasaran.</li>
            <li>PIN minimal 6 angka (maksimum 8) dengan hashing PBKDF2-SHA256.</li>
            <li>Login throttling eksponensial diberlakukan setelah beberapa kali gagal berurutan.</li>
            <li>Auto-lock benar-benar menghapus kunci enkripsi dari memori.</li>
          </ul>

          <div class="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-lg p-3 mb-4">
            <p class="text-xs font-bold text-rose-800 dark:text-rose-200 mb-1">Peringatan:</p>
            <p class="text-xs text-rose-700 dark:text-rose-300">Jika Anda lupa PIN dan tidak memiliki backup terenkripsi (.risly.enc) atau file JSON, data keuangan Anda <strong>tidak bisa dibuka kembali dan hilang permanen</strong>. Tidak ada mekanisme "lupa PIN" yang bisa membuka data terenkripsi karena kami tidak menyimpan kunci enkripsi di server.</p>
          </div>

          <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 mt-4">6. Hak &amp; Penghapusan Data</h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 mb-3">Anda berhak untuk berhenti menggunakan aplikasi kapan saja. Untuk menghapus data, hapus aplikasi/PWA dari perangkat Anda dan hapus data penyimpanan browser (cache, IndexedDB, localStorage). Anda juga dapat menghubungi pengembang melalui email untuk pertanyaan privasi data.</p>

          <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 mt-4">7. Perubahan Kebijakan Privasi</h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 mb-3">Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Perubahan akan diberitakan melalui aplikasi atau halaman ini, serta tercantum tanggal pembaruan terbaru di atas.</p>

          <h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 mt-4">8. Hubungi Kami</h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 mb-4">Jika Anda memiliki pertanyaan mengenai Kebijakan Privasi ini, silakan hubungi pengembang aplikasi melalui email yang tercantum di aplikasi atau repositori GitHub resmi.</p>
        </div>
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Tutup</button>
      </footer>
    `,
  });
}

export {
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
  openJoinWorkspaceModal,
  openLoanScheduleModal,
  openPrivacyModal,
  authCloudFields,
  openAuthCloudModal,
};
