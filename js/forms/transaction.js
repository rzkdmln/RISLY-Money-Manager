import { FREQUENCIES, TX_TYPES } from '../config.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { progressBar } from '../ui.js';
import {
  escapeAttr,
  escapeHTML,
  expressionResult,
  formatCurrency,
  formatMonth,
  monthKey,
  todayISO,
} from '../utils.js';

function accountOptions(selectedId, includeId = null) {
  return store.data.accounts
    .filter((account) => !account.deletedAt)
    .filter((account) => !account.archived || account.id === selectedId || account.id === includeId)
    .map((account) => `<option value="${escapeAttr(account.id)}" ${selectedId === account.id ? 'selected' : ''}>${escapeHTML(account.name)}${account.archived ? ' (arsip)' : ''}</option>`)
    .join('');
}

function categoryOptions(type, selectedId = null) {
  return store.data.categories
    .filter((category) => !category.deletedAt || category.id === selectedId)
    .filter((category) => category.type === type)
    .map((category) => `<option value="${escapeAttr(category.id)}" ${selectedId === category.id ? 'selected' : ''}>${escapeHTML(category.name)}${category.deletedAt ? ' (arsip)' : ''}</option>`)
    .join('');
}

export function subcategoryOptions(categoryId, selectedId = null) {
  const category = store.categoryById(categoryId);
  if (!category?.subcategories?.length) return '<option value="">Tanpa subkategori</option>';
  return `<option value="">Tanpa subkategori</option>${category.subcategories
    .filter((sub) => !sub.deletedAt || sub.id === selectedId)
    .map((sub) => `<option value="${escapeAttr(sub.id)}" ${selectedId === sub.id ? 'selected' : ''}>${escapeHTML(sub.name)}</option>`)
    .join('')}`;
}

export function transactionForm(tx = null, defaults = {}) {
  const type = tx?.type || defaults.type || 'expense';
  const typeData = TX_TYPES[type] || TX_TYPES.expense;
  const date = tx?.date || defaults.date || todayISO();
  const amountExpression = tx?.amount ? String(tx.amount) : (defaults.amount || '');
  const accountId = tx?.accountId || defaults.accountId || store.activeAccounts()[0]?.id || '';
  const toAccountId = tx?.toAccountId || defaults.toAccountId || store.activeAccounts().find((account) => account.id !== accountId)?.id || '';
  const isTransfer = type === 'transfer';
  const categoryType = type === 'income' ? 'income' : 'expense';
  const categoryList = store.categories(categoryType);
  let categoryId = !isTransfer ? (tx?.categoryId || defaults.categoryId || '') : '';
  if (!categoryList.some((category) => category.id === categoryId)) {
    categoryId = categoryList[0]?.id || '';
  }
  let subcategoryId = !isTransfer ? (tx?.subcategoryId || defaults.subcategoryId || '') : '';
  const selectedCategory = store.categoryById(categoryId);
  if (subcategoryId && !selectedCategory?.subcategories?.some((sub) => sub.id === subcategoryId)) {
    subcategoryId = '';
  }
  const note = tx?.note || defaults.note || '';
  const editing = Boolean(tx?.id);
  const result = expressionResult(amountExpression);
  const currentUser = store.currentUser;
  const recurring = Boolean(defaults.recurring) || Boolean(tx?.makeRecurring);
  const defaultFrequency = defaults.frequency || 'monthly';
  const recurringTitle = defaults.recurringTitle || note || (store.categoryById(categoryId)?.name || 'Transaksi berulang');

  return `<form data-form="transaction" data-id="${escapeAttr(tx?.id || '')}" class="modal-form" novalidate>
    <header class="modal-header">
      <div class="min-w-0">
        <p class="modal-kicker">${editing ? 'Perbarui catatan' : 'Catat aliran uang'}</p>
        <h2 class="modal-title">${editing ? 'Ubah transaksi' : 'Transaksi baru'}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>

    <div class="modal-body">
      <input type="hidden" name="type" value="${escapeAttr(type)}">

      <div class="type-segment" role="tablist" aria-label="Jenis transaksi">
        ${Object.entries(TX_TYPES).map(([id, item]) => `<button type="button" role="tab" aria-selected="${type === id}" class="type-segment-btn type-${id} ${type === id ? 'is-active' : ''}" data-action="tx-form-type" data-type="${id}">
          ${icon(item.icon, 'w-4 h-4')} ${escapeHTML(item.label)}
        </button>`).join('')}
      </div>

      <div class="calculator-card">
        <label class="field-label" for="tx-amount-expression">Nominal</label>
        <input id="tx-amount-expression" class="calc-display" name="amountExpression" inputmode="decimal" autocomplete="off" value="${escapeAttr(amountExpression)}" placeholder="0" aria-label="Nominal atau ekspresi matematika">
        <div class="calc-result">
          <span>${icon('calculator', 'w-3.5 h-3.5')} Hasil</span>
          <strong id="tx-amount-result" class="${result === null ? 'text-slate-400' : ''}">${result === null ? 'Masukkan nominal' : formatCurrency(result, { hide: false })}</strong>
        </div>
        <div class="calc-keypad">
          <button type="button" class="calc-key calc-key-muted" data-calc-key="clear">C</button>
          <button type="button" class="calc-key calc-key-muted" data-calc-key="back" aria-label="Hapus">${icon('delete', 'w-4 h-4')}</button>
          <button type="button" class="calc-key calc-key-op" data-calc-key="÷">÷</button>
          <button type="button" class="calc-key calc-key-op" data-calc-key="×">×</button>
          ${[7, 8, 9].map((n) => `<button type="button" class="calc-key" data-calc-key="${n}">${n}</button>`).join('')}
          <button type="button" class="calc-key calc-key-op" data-calc-key="−">−</button>
          ${[4, 5, 6].map((n) => `<button type="button" class="calc-key" data-calc-key="${n}">${n}</button>`).join('')}
          <button type="button" class="calc-key calc-key-op" data-calc-key="+">+</button>
          ${[1, 2, 3].map((n) => `<button type="button" class="calc-key" data-calc-key="${n}">${n}</button>`).join('')}
          <button type="button" class="calc-key calc-key-equal" data-calc-key="=" aria-label="Hitung">=</button>
          <button type="button" class="calc-key calc-key-muted" data-calc-key="000">000</button>
          <button type="button" class="calc-key" data-calc-key="0">0</button>
          <button type="button" class="calc-key" data-calc-key=".">.</button>
        </div>
      </div>

      <div class="form-grid">
        <label class="field-label">Tanggal
          <input class="field mt-1.5" type="date" name="date" value="${escapeAttr(date)}" required>
        </label>
        <label class="field-label">${isTransfer ? 'Dari akun' : 'Akun'}
          <select class="field mt-1.5" name="accountId" required>
            ${accountOptions(accountId)}
          </select>
        </label>
      </div>

      ${isTransfer ? `<label class="field-label">Ke akun
        <select class="field mt-1.5" name="toAccountId" required>
          ${accountOptions(toAccountId, accountId)}
        </select>
      </label>` : `
        <div class="form-grid">
          <label class="field-label">Kategori
            <select class="field mt-1.5" name="categoryId" id="tx-category" required>
              ${categoryOptions(type === 'income' ? 'income' : 'expense', categoryId)}
            </select>
          </label>
          <label class="field-label">Subkategori
            <select class="field mt-1.5" name="subcategoryId" id="tx-subcategory">
              ${subcategoryOptions(categoryId, subcategoryId)}
            </select>
          </label>
        </div>`}

      <label class="field-label">Catatan
        <textarea class="field textarea mt-1.5" name="note" rows="2" maxlength="280" placeholder="Contoh: belanja mingguan, gaji, transfer tabungan…">${escapeHTML(note)}</textarea>
      </label>

      <div class="tx-form-meta">
        <span class="creator-chip" style="--creator-color:${escapeAttr(currentUser?.color || '#64748B')}">${escapeHTML(currentUser?.name || '—')}</span>
        <span>dicatat oleh ${escapeHTML(currentUser?.name || '—')}${editing ? ` · pembuat awal ${escapeHTML(tx?.createdByName || '—')}` : ''}</span>
      </div>

      ${editing ? `<div class="tx-edit-note">${icon('info', 'w-3.5 h-3.5')} Perubahan nominal akan langsung menyesuaikan saldo akun terkait.</div>` : ''}

      ${!editing ? `<div class="recurring-box">
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
