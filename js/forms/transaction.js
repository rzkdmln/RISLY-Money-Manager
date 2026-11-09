import { FREQUENCIES, TX_TYPES } from '../config.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { progressBar, ui } from '../ui.js';
import {
  currentTimeHHMM,
  escapeAttr,
  escapeHTML,
  expressionResult,
  formatAmountExpression,
  formatCurrency,
  formatDateDMY,
  formatMonth,
  monthKey,
  normalizeTime,
  safeNumber,
  timeFromISO,
  todayISO,
} from '../utils.js';

export function accountOptions(selectedId, includeId = null, ownerId = null, placeholder = 'Pilih Akun') {
  const accounts = store.data.accounts
    .filter((account) => !account.deletedAt)
    .filter((account) => !account.archived || account.id === selectedId || account.id === includeId)
    .filter((account) => !ownerId || ownerId === 'all' || account.owner === ownerId);
  const hasSelected = Boolean(selectedId) && accounts.some((account) => account.id === selectedId);
  return `<option value="" ${!hasSelected ? 'selected' : ''}>${escapeHTML(placeholder)}</option>` +
    accounts
      .map((account) => `<option value="${escapeAttr(account.id)}" ${selectedId === account.id ? 'selected' : ''}>${escapeHTML(account.name)}${account.archived ? ' (arsip)' : ''}</option>`)
      .join('');
}

function categoryOptions(type, selectedId = null) {
  const categories = store.data.categories
    .filter((category) => !category.deletedAt || category.id === selectedId)
    .filter((category) => category.type === type);
  const hasSelected = Boolean(selectedId) && categories.some((category) => category.id === selectedId);
  return `<option value="" ${!hasSelected ? 'selected' : ''}>Pilih Kategori</option>` +
    categories
      .map((category) => `<option value="${escapeAttr(category.id)}" ${selectedId === category.id ? 'selected' : ''}>${escapeHTML(category.name)}${category.deletedAt ? ' (arsip)' : ''}</option>`)
      .join('');
}

export function subcategoryOptions(categoryId, selectedId = null) {
  const category = store.categoryById(categoryId);
  const subcategories = category?.subcategories?.filter((sub) => !sub.deletedAt || sub.id === selectedId) || [];
  const hasSelected = Boolean(selectedId) && subcategories.some((sub) => sub.id === selectedId);
  let placeholder = 'Pilih Subkategori';
  if (!category) placeholder = 'Pilih Kategori dahulu';
  else if (!subcategories.length) placeholder = 'Tanpa subkategori';
  return `<option value="" ${!hasSelected ? 'selected' : ''}>${escapeHTML(placeholder)}</option>` +
    subcategories
      .map((sub) => `<option value="${escapeAttr(sub.id)}" ${selectedId === sub.id ? 'selected' : ''}>${escapeHTML(sub.name)}</option>`)
      .join('');
}

export function transactionForm(tx = null, defaults = {}) {
  const type = tx?.type || defaults.type || 'expense';
  const typeData = TX_TYPES[type] || TX_TYPES.expense;
  const date = tx?.date || defaults.date || todayISO();
  const time = normalizeTime(
    tx?.time || defaults.time,
    timeFromISO(tx?.createdAt) || currentTimeHHMM(),
  );
  const amountExpression = tx?.amount ? String(tx.amount) : (defaults.amount || '');
  const displayAmount = formatAmountExpression(amountExpression);
  const calcOpen = Boolean(defaults.calcOpen ?? ui.calcOpen);
  const accountId = tx?.accountId || defaults.accountId || '';
  const selectedAccount = store.accountById(accountId);
  const accountOwner = defaults.accountOwner || selectedAccount?.owner || store.currentUser?.id || 'all';
  const toAccountId = tx?.toAccountId || defaults.toAccountId || '';
  const isTransfer = type === 'transfer';
  const categoryType = type === 'income' ? 'income' : 'expense';
  const categoryList = store.categories(categoryType);
  let categoryId = !isTransfer ? (tx?.categoryId || defaults.categoryId || '') : '';
  if (categoryId && !categoryList.some((category) => category.id === categoryId)) {
    categoryId = '';
  }
  let subcategoryId = !isTransfer ? (tx?.subcategoryId || defaults.subcategoryId || '') : '';
  const selectedCategory = store.categoryById(categoryId);
  if (subcategoryId && !selectedCategory?.subcategories?.some((sub) => sub.id === subcategoryId)) {
    subcategoryId = '';
  }
  const note = tx?.note || defaults.note || '';
  const payee = tx?.payee || defaults.payee || '';
  const tagsValue = Array.isArray(tx?.tags) ? tx.tags.join(', ') : (defaults.tags || '');
  const tagsArray = Array.isArray(tx?.tags) ? tx.tags : (String(defaults.tags || '').split(',').map(t => t.trim()).filter(Boolean));
  const splits = Array.isArray(tx?.splits) ? tx.splits : [];
  const receipt = typeof tx?.receipt === 'string' ? tx.receipt : '';
  const editing = Boolean(tx?.id);
  const result = expressionResult(displayAmount);
  const currentUser = store.currentUser;
  const recurring = Boolean(defaults.recurring) || Boolean(tx?.makeRecurring);
  const defaultFrequency = defaults.frequency || 'monthly';
  const optionalOpen = Boolean(payee || tagsValue || (Array.isArray(splits) && splits.length) || recurring);
  const recurringTitle = defaults.recurringTitle || note || (store.categoryById(categoryId)?.name || 'Transaksi berulang');

  function splitRowHtml(split = {}) {
    const catId = split.categoryId || '';
    const subId = split.subcategoryId || '';
    const amt = split.amount || '';
    const n = split.note || '';
    return `<div class="split-row grid grid-cols-12 gap-2 items-end" data-split-row>
      <div class="col-span-12 sm:col-span-4">
        <label class="field-label text-[11px]">Kategori
          <select class="field mt-1" name="splitCategory" required>
            ${categoryOptions(type === 'income' ? 'income' : 'expense', catId)}
          </select>
        </label>
      </div>
      <div class="col-span-12 sm:col-span-3">
        <label class="field-label text-[11px]">Subkategori
          <select class="field mt-1" name="splitSubcategory" ${!catId || !store.categoryById(catId)?.subcategories?.length ? 'disabled' : ''}>
            ${subcategoryOptions(catId, subId)}
          </select>
        </label>
      </div>
      <div class="col-span-7 sm:col-span-3">
        <label class="field-label text-[11px]">Nominal
          <input class="field mt-1" type="number" name="splitAmount" min="0" step="1" inputmode="numeric" value="${escapeAttr(amt)}" required>
        </label>
      </div>
      <div class="col-span-5 sm:col-span-2 flex items-end justify-end sm:justify-start">
        <button type="button" class="icon-btn text-red-500" data-action="remove-split" aria-label="Hapus baris">${icon('x', 'w-3.5 h-3.5')}</button>
      </div>
      <div class="col-span-12">
        <input class="field mt-1 text-[11px]" name="splitNote" maxlength="120" placeholder="Catatan baris (opsional)" value="${escapeAttr(n)}">
      </div>
    </div>`;
  }

  return `<form data-form="transaction" data-id="${escapeAttr(tx?.id || '')}" class="modal-form" novalidate>
    <header class="modal-header">
      <div class="modal-heading">
        <span class="modal-heading-icon type-${escapeAttr(type)}" aria-hidden="true">${icon(typeData.icon, 'w-4.5 h-4.5')}</span>
        <div class="min-w-0">
          <p class="modal-kicker">${editing ? 'Perbarui catatan' : 'Catat aliran uang'}</p>
          <h2 class="modal-title" id="transaction-modal-title">${editing ? 'Ubah transaksi' : 'Transaksi baru'}</h2>
        </div>
      </div>
      <button type="button" class="icon-btn modal-close" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>

    <div class="modal-body">
      <input type="hidden" name="type" value="${escapeAttr(type)}">

      <div class="type-segment" role="tablist" aria-label="Jenis transaksi">
        ${Object.entries(TX_TYPES).map(([id, item]) => `<button type="button" role="tab" aria-selected="${type === id}" class="type-segment-btn type-${id} ${type === id ? 'is-active' : ''}" data-action="tx-form-type" data-type="${id}">
          ${icon(item.icon, 'w-4 h-4')} ${escapeHTML(item.label)}
        </button>`).join('')}
      </div>

      <div class="calculator-card">
        <div class="amount-label-row">
          <label class="field-label" for="tx-amount-expression">Nominal</label>
          <button type="button" class="calc-toggle ${calcOpen ? 'is-open' : ''}" data-action="toggle-calc" aria-expanded="${calcOpen}" aria-controls="tx-calc-keypad" aria-label="${calcOpen ? 'Sembunyikan kalkulator' : 'Tampilkan kalkulator'}">${icon('calculator', 'w-4 h-4')}</button>
        </div>
        <input id="tx-amount-expression" class="calc-display" name="amountExpression" inputmode="decimal" autocomplete="off" value="${escapeAttr(displayAmount)}" placeholder="0" aria-label="Nominal atau ekspresi matematika" ${splits.length ? 'readonly' : ''}>
        <div class="calc-result">
          <span>${icon('calculator', 'w-3.5 h-3.5')} Hasil</span>
          <strong id="tx-amount-result" class="${result === null ? 'text-slate-400' : ''}">${result === null ? 'Masukkan nominal' : formatCurrency(result, { hide: false })}</strong>
        </div>
        <div class="calc-keypad calc-keypad-compact" id="tx-calc-keypad" data-calc-keypad ${calcOpen ? '' : 'hidden'}>
          <button type="button" class="calc-key calc-key-muted" data-calc-key="clear">C</button>
          <button type="button" class="calc-key calc-key-op" data-calc-key="÷">÷</button>
          <button type="button" class="calc-key calc-key-op" data-calc-key="×">×</button>
          <button type="button" class="calc-key calc-key-op" data-calc-key="−">−</button>
          <button type="button" class="calc-key calc-key-op" data-calc-key="+">+</button>
          <button type="button" class="calc-key calc-key-equal" data-calc-key="=" aria-label="Hitung">=</button>
        </div>
      </div>

      <div class="form-grid date-time-grid">
        <label class="field-label">Tanggal
          <div class="date-input-wrap mt-1.5">
            <input class="field date-display" type="text" name="dateDisplay" inputmode="numeric" autocomplete="off" placeholder="dd/mm/yyyy" maxlength="10" value="${escapeAttr(formatDateDMY(date))}" aria-label="Tanggal (dd/mm/yyyy)" required>
            <button type="button" class="date-pick-btn" data-action="pick-date" aria-label="Buka kalender">${icon('calendar', 'w-4 h-4')}</button>
            <input class="date-native" type="date" name="date" value="${escapeAttr(date)}" tabindex="-1" aria-hidden="true">
          </div>
        </label>
        <label class="field-label">Jam
          <input class="field mt-1.5 w-full min-w-0 text-center appearance-none" type="time" name="time" value="${escapeAttr(time)}" required>
        </label>
      </div>
      <label class="field-label">Pemilik akun
        <select class="field mt-1.5" name="accountOwner">
          <option value="all" ${accountOwner === 'all' ? 'selected' : ''}>Semua anggota</option>
          ${store.activeUsers().map((u) => `<option value="${escapeAttr(u.id)}" ${accountOwner === u.id ? 'selected' : ''}>${escapeHTML(u.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field-label">${isTransfer ? 'Dari akun' : 'Akun'}
        <select class="field mt-1.5" name="accountId" required>
          ${accountOptions(accountId, null, accountOwner === 'all' ? null : accountOwner)}
        </select>
      </label>
      ${!isTransfer && selectedAccount?.type === 'credit' ? (() => {
        const creditLimit = safeNumber(selectedAccount.creditLimit);
        const spent = store.creditSpent(selectedAccount.id);
        const remaining = Math.max(0, creditLimit - spent);
        const hasLimit = creditLimit > 0;
        const resultAmount = expressionResult(displayAmount);
        const overLimit = hasLimit && resultAmount !== null && resultAmount > remaining;
        return `<div class="tx-credit-box">
          <p class="text-[12px] text-slate-500 dark:text-slate-400">
            ${hasLimit
              ? `Limit kredit ${formatCurrency(creditLimit)} · terpakai ${formatCurrency(spent)} · sisa ${formatCurrency(remaining)}`
              : 'Belum diatur batas kredit untuk akun ini.'}
          </p>
          ${overLimit ? `<p class="text-[12px] text-red-500 dark:text-red-400 mt-1">Nominal melebihi sisa limit kredit. Kurangi nominal atau pilih akun lain.</p>` : ''}
        </div>`;
      })() : ''}

      ${isTransfer ? `<label class="field-label">Ke akun
        <select class="field mt-1.5" name="toAccountId" required>
          ${accountOptions(toAccountId, accountId, 'all', 'Pilih Akun Tujuan')}
        </select>
      </label>` : `
        <div class="form-grid">
          <label class="field-label">Kategori
            <select class="field mt-1.5" name="categoryId" id="tx-category" ${splits.length ? '' : 'required'}>
              ${categoryOptions(type === 'income' ? 'income' : 'expense', categoryId)}
            </select>
          </label>
          <label class="field-label">Subkategori
            <select class="field mt-1.5" name="subcategoryId" id="tx-subcategory" ${!categoryId || !store.categoryById(categoryId)?.subcategories?.length ? 'disabled' : ''}>
              ${subcategoryOptions(categoryId, subcategoryId)}
            </select>
          </label>
        </div>`}

      <label class="field-label">Catatan
        <textarea class="field textarea mt-1.5" name="note" rows="2" maxlength="280" placeholder="Contoh: belanja mingguan, gaji, transfer tabungan…">${escapeHTML(note)}</textarea>
      </label>

      <div class="receipt-field mt-3">
        <div class="receipt-field-head">
          <div class="receipt-label">Lampiran struk <span class="receipt-optional">Opsional</span></div>
          <p class="receipt-hint">JPG atau PNG · maksimal 450 KB</p>
        </div>

        <div class="receipt-upload-wrap ${receipt ? 'hidden' : ''}" data-receipt-upload>
          <label class="receipt-upload-btn" aria-label="Pilih foto struk">
            <span class="receipt-upload-icon" aria-hidden="true">${icon('upload', 'w-4.5 h-4.5')}</span>
            <span class="receipt-upload-text">
              <strong>Pilih foto struk</strong>
              <small>Ketuk untuk memilih dari galeri</small>
            </span>
            <input class="field sr-only" type="file" name="receiptFile" accept="image/*" data-receipt-file>
          </label>
        </div>

        <input type="hidden" name="receipt" value="${escapeAttr(receipt)}">
        <div class="receipt-preview ${receipt ? '' : 'hidden'}" data-receipt-wrap>
          <button type="button" class="receipt-preview-image" data-action="view-receipt" aria-label="Perbesar foto struk" title="Klik untuk memperbesar">
            <img src="${receipt ? escapeAttr(receipt) : ''}" alt="Struk" data-receipt-preview>
            <span class="receipt-preview-badge" aria-hidden="true">${icon('eye', 'w-3 h-3')}</span>
          </button>
          <div class="receipt-preview-bar">
            <div class="receipt-preview-meta">
              <strong data-receipt-name>Struk terlampir</strong>
              <small>Klik gambar untuk melihat ukuran penuh</small>
            </div>
            <div class="receipt-preview-actions">
              <button type="button" class="receipt-action-btn" data-action="choose-receipt" data-receipt-change>${icon('upload', 'w-3.5 h-3.5')} Ganti</button>
              <button type="button" class="receipt-action-btn is-danger" data-action="remove-receipt">${icon('trash', 'w-3.5 h-3.5')} Hapus</button>
            </div>
          </div>
        </div>
      </div>

      <details class="tx-optional-details" ${optionalOpen ? 'open' : ''}>
        <summary>Opsi lainnya (opsional)</summary>
        <div class="form-grid">
          <label class="field-label">Payee / merchant (opsional)
            <input class="field mt-1.5" name="payee" maxlength="80" value="${escapeAttr(payee)}" placeholder="Contoh: Indomaret, PLN, GoPay">
          </label>
          <label class="field-label">Tag (opsional)
            <div class="tag-input mt-1.5" data-tag-input>
              <input type="hidden" name="tags" value="${escapeAttr(tagsValue)}" data-tag-value>
              <div class="tag-input-chips" data-tag-chips role="list">
                ${tagsArray.map(t => {
                  const tagLabel = t.startsWith('#') ? t : '#' + t;
                  return `
                  <span class="tag-chip" role="listitem" data-tag="${escapeAttr(tagLabel)}">
                    ${escapeHTML(tagLabel)}
                    <button type="button" class="tag-chip-remove" data-tag-remove aria-label="Hapus tag ${escapeHTML(t)}">×</button>
                  </span>
                `;
                }).join('')}
                <input type="text" class="tag-input-field" placeholder="contoh: keluarga, makan" data-tag-field autocomplete="off" spellcheck="false" role="textbox" aria-label="Tambah tag">
              </div>
              <p class="text-[10px] text-slate-400">Spasi, koma, titik, atau Enter untuk tambah tag</p>
            </div>
          </label>
        </div>

        ${!isTransfer ? `<label class="toggle-row compact-toggle mt-3">
          <span><strong>Split transaksi</strong><small>Pecah nominal ke beberapa kategori</small></span>
          <input type="checkbox" name="makeSplit" value="1" class="sr-only" ${splits.length ? 'checked' : ''} data-toggle-split>
          <span class="switch ${splits.length ? 'is-on' : ''}"></span>
        </label>
        <div class="split-section mt-2" ${splits.length ? '' : 'hidden'}>
          <div data-split-rows class="space-y-2">
            ${(splits.length ? splits : [{}]).map((s) => splitRowHtml(s)).join('')}
          </div>
          <div class="split-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-action="add-split">${icon('plus', 'w-3.5 h-3.5')} Tambah baris split</button>
            <span class="split-total" data-split-total>${splits.length ? `Total ${formatCurrency(tx?.amount || 0)}` : 'Belum ada nominal'}</span>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Total nominal otomatis dijumlahkan dari baris split.</p>
        </div>` : ''}

        ${!editing ? `<div class="recurring-box mt-3">
          <label class="toggle-row">
            <span>
              <strong>Jadikan transaksi berulang</strong>
              <small>Buat jadwal otomatis setelah transaksi ini.</small>
            </span>
            <input type="checkbox" name="makeRecurring" value="1" class="sr-only" ${recurring ? 'checked' : ''} data-toggle-recurring>
            <span class="switch ${recurring ? 'is-on' : ''}"></span>
          </label>
          <div class="recurring-extra" ${recurring ? '' : 'hidden'}>
            <label class="field-label">Nama jadwal
              <input class="field mt-1.5" name="recurringTitle" value="${escapeAttr(recurringTitle)}" maxlength="80">
            </label>
            <div class="form-grid">
              <label class="field-label">Frekuensi
                <select class="field mt-1.5" name="recurringFrequency">
                  ${Object.entries(FREQUENCIES).map(([id, item]) => `<option value="${id}" ${defaultFrequency === id ? 'selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}
                </select>
              </label>
              <label class="field-label">Setiap
                <input class="field mt-1.5" type="number" name="recurringInterval" min="1" max="12" value="1" inputmode="numeric">
              </label>
            </div>
            <p class="text-[11px] text-slate-400">Jadwal berikutnya dihitung setelah tanggal transaksi ini. Posting otomatis saat aplikasi dibuka.</p>
          </div>
        </div>` : ''}
      </details>

      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>

    <footer class="modal-footer">
      ${editing ? `<button type="button" class="btn btn-danger-soft" data-action="delete-tx" data-id="${escapeAttr(tx.id)}">${icon('trash', 'w-4 h-4')} Hapus</button>` : '<span></span>'}
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} ${editing ? 'Simpan perubahan' : 'Simpan transaksi'}</button>
      </div>
    </footer>
  </form>`;
}

export function recurringForm(rule = null, defaults = {}) {
  const type = rule?.type || defaults.type || 'expense';
  const amount = rule?.amount || defaults.amount || '';
  const accountId = rule?.accountId || defaults.accountId || store.activeAccounts()[0]?.id || '';
  const toAccountId = rule?.toAccountId || defaults.toAccountId || store.activeAccounts().find((a) => a.id !== accountId)?.id || '';
  const categoryId = rule?.categoryId || defaults.categoryId || store.categories(type === 'income' ? 'income' : 'expense')[0]?.id || '';
  const isTransfer = type === 'transfer';
  return `<form data-form="recurring" data-id="${escapeAttr(rule?.id || '')}" class="modal-form" novalidate>
    <header class="modal-header">
      <div>
        <p class="modal-kicker">${rule ? 'Perbarui jadwal' : 'Otomatisasi'}</p>
        <h2 class="modal-title">${rule ? 'Ubah transaksi berulang' : 'Jadwal baru'}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <input type="hidden" name="type" value="${escapeAttr(type)}">
      <div class="type-segment" role="tablist" aria-label="Jenis transaksi berulang">
        ${Object.entries(TX_TYPES).map(([id, item]) => `<button type="button" role="tab" aria-selected="${type === id}" class="type-segment-btn type-${id} ${type === id ? 'is-active' : ''}" data-action="rec-form-type" data-type="${id}">
          ${icon(item.icon, 'w-4 h-4')} ${escapeHTML(item.label)}
        </button>`).join('')}
      </div>
      <label class="field-label">Nama jadwal
        <input class="field mt-1.5" name="title" value="${escapeAttr(rule?.title || defaults.title || '')}" placeholder="Listrik & internet, gaji, tabungan…" maxlength="80" required>
      </label>
      <div class="form-grid">
        <label class="field-label">Nominal
          <div class="input-with-prefix mt-1.5"><span>Rp</span><input class="field" type="number" name="amount" min="1" step="1" inputmode="numeric" value="${escapeAttr(amount)}" required></div>
        </label>
        <label class="field-label">Jatuh tempo berikutnya
          <input class="field mt-1.5" type="date" name="nextDate" value="${escapeAttr(rule?.nextDate || defaults.nextDate || todayISO())}" required>
        </label>
        <p class="text-[12px] text-slate-400 mt-1">Pilih tanggal dari kalender browser.</p>
      </div>
      <div class="form-grid">
        <label class="field-label">${isTransfer ? 'Dari akun' : 'Akun'}
          <select class="field mt-1.5" name="accountId" required>${accountOptions(accountId)}</select>
        </label>
        ${isTransfer ? `<label class="field-label">Ke akun
          <select class="field mt-1.5" name="toAccountId" required>${accountOptions(toAccountId, accountId)}</select>
        </label>` : `<label class="field-label">Kategori
          <select class="field mt-1.5" name="categoryId" required>${categoryOptions(type === 'income' ? 'income' : 'expense', categoryId)}</select>
        </label>`}
      </div>
      ${!isTransfer ? `<label class="field-label">Subkategori
        <select class="field mt-1.5" name="subcategoryId">${subcategoryOptions(categoryId, rule?.subcategoryId || '')}</select>
      </label>` : ''}
      <div class="form-grid">
        <label class="field-label">Frekuensi
          <select class="field mt-1.5" name="frequency">
            ${Object.entries(FREQUENCIES).map(([id, item]) => `<option value="${id}" ${(rule?.frequency || 'monthly') === id ? 'selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}
          </select>
        </label>
        <label class="field-label">Setiap
          <input class="field mt-1.5" type="number" name="interval" min="1" max="31" value="${rule?.interval || 1}" inputmode="numeric">
        </label>
      </div>
      <div class="form-grid">
        <label class="field-label">Berakhir (opsional)
          <input class="field mt-1.5" type="date" name="endDate" value="${escapeAttr(rule?.endDate || '')}">
        </label>
        <label class="toggle-row compact-toggle mt-6">
          <span><strong>Posting otomatis</strong><small>Jika mati, posting manual</small></span>
          <input type="checkbox" name="autoPost" value="1" class="sr-only" ${rule?.autoPost !== false ? 'checked' : ''}>
          <span class="switch ${rule?.autoPost !== false ? 'is-on' : ''}"></span>
        </label>
      </div>
      <label class="toggle-row compact-toggle">
        <span><strong>Jadwal aktif</strong><small>Hentikan sementara tanpa menghapus</small></span>
        <input type="checkbox" name="active" value="1" class="sr-only" ${rule?.active !== false ? 'checked' : ''}>
        <span class="switch ${rule?.active !== false ? 'is-on' : ''}"></span>
      </label>
      <label class="field-label">Catatan
        <textarea class="field textarea mt-1.5" name="note" rows="2" maxlength="280">${escapeHTML(rule?.note || '')}</textarea>
      </label>
      <div class="tx-form-meta"><span class="creator-chip">${icon('repeat', 'w-3 h-3')}</span><span>Jadwal diproses saat aplikasi dibuka.</span></div>
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      ${rule ? `<button type="button" class="btn btn-danger-soft" data-action="delete-rec" data-id="${escapeAttr(rule.id)}">${icon('trash', 'w-4 h-4')} Hapus</button>` : '<span></span>'}
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} Simpan jadwal</button>
      </div>
    </footer>
  </form>`;
}
