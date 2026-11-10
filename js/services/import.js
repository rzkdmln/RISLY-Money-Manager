/**
 * RISLY Money Manager — CSV/Excel import
 *
 * Handles reading uploaded spreadsheets, auto-mapping columns,
 * duplicate detection, preview modal, and selective import.
 */

/* Imports */
import { store } from '../core/store.js';
import { money, openModal, closeModal, toast, ui } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import { downloadBlob, escapeAttr, escapeHTML } from '../core/utils.js';
import { TX_TYPES } from '../core/config.js';

/* ------------------------------------------------------------------------ */
/*  Label helpers                                                           */
/* ------------------------------------------------------------------------ */

export function typeLabel(type) {
  return TX_TYPES[type]?.label || 'Transaksi';
}

/* ------------------------------------------------------------------------ */
/*  File reading                                                            */
/* ------------------------------------------------------------------------ */

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca file'));
    reader.readAsArrayBuffer(file);
  });
}

/* ------------------------------------------------------------------------ */
/*  Helpers                                                                 */
/* ------------------------------------------------------------------------ */

function txFingerprint(tx) {
  return [
    String(tx.date || ''),
    String(tx.type || ''),
    Math.round(Number(tx.amount) || 0),
    String(tx.accountId || ''),
    String(tx.note || '').trim().toLowerCase(),
  ].join('|');
}

function findImportHeader(headers, candidates) {
  const normalized = headers.map((h) => ({ h, n: String(h).trim().toLowerCase() }));
  for (const c of candidates) {
    const found = normalized.find(({ n }) => n === c);
    if (found) return found.h;
  }
  for (const c of candidates) {
    const found = normalized.find(({ n }) => n.includes(c));
    if (found) return found.h;
  }
  return null;
}

function findAccountIdByName(name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  const acc = store.activeAccounts().find((a) => String(a.name).trim().toLowerCase() === n);
  return acc?.id || null;
}

function findCategoryIdByName(name, type) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  const cats = store.categories(type === 'income' ? 'income' : 'expense');
  const cat = cats.find((c) => String(c.name).trim().toLowerCase() === n);
  return cat?.id || null;
}

function normalizeImportDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = window.XLSX?.SSF?.parse_date_code?.(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    return '';
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  let m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function parseImportNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  let s = String(value).trim();
  s = s.replace(/[Rp\s]/gi, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function mapImportType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (['income', 'pemasukan', 'masuk', 'credit', 'kredit'].includes(t)) return 'income';
  if (['expense', 'pengeluaran', 'keluar', 'debit', 'debet'].includes(t)) return 'expense';
  if (['transfer'].includes(t)) return 'transfer';
  return '';
}

/* ------------------------------------------------------------------------ */
/*  Import flow                                                             */
/* ------------------------------------------------------------------------ */

export async function startTransactionImport(file) {
  if (!window.XLSX) {
    toast('Pustaka Excel belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = window.XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  if (!workbook.SheetNames?.length) throw new Error('File tidak memiliki sheet.');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!rows.length) throw new Error('File tidak berisi data.');

  const headers = Object.keys(rows[0] || {});
  const mapping = {
    date: findImportHeader(headers, ['tanggal', 'date', 'tgl', 'transaction date', 'trans date', 'waktu transaksi']),
    type: findImportHeader(headers, ['jenis', 'type', 'tipe', 'transaction type', 'jenis transaksi']),
    amount: findImportHeader(headers, ['nominal', 'amount', 'jumlah', 'nilai', 'total']),
    debit: findImportHeader(headers, ['debit', 'debet', 'pengeluaran', 'keluar']),
    credit: findImportHeader(headers, ['kredit', 'credit', 'pemasukan', 'masuk']),
    account: findImportHeader(headers, ['akun', 'account', 'rekening', 'wallet', 'akun sumber', 'sumber']),
    toAccount: findImportHeader(headers, ['ke akun', 'to account', 'akun tujuan', 'tujuan']),
    category: findImportHeader(headers, ['kategori', 'category']),
    note: findImportHeader(headers, ['catatan', 'note', 'keterangan', 'memo', 'berita']),
    payee: findImportHeader(headers, ['payee', 'merchant', 'pedagang', 'toko', 'description', 'deskripsi', 'nama']),
  };

  const defaultAccountId = store.activeAccounts()[0]?.id || null;
  const existingFingerprints = new Set(store.transactions().map((tx) => txFingerprint(tx)));
  const seen = new Set();

  const parsedRows = rows.map((row, index) => {
    const date = normalizeImportDate(mapping.date ? row[mapping.date] : '');
    let type = mapImportType(mapping.type ? row[mapping.type] : '');
    let amount = 0;
    let debit = mapping.debit ? parseImportNumber(row[mapping.debit]) : 0;
    let credit = mapping.credit ? parseImportNumber(row[mapping.credit]) : 0;
    if (mapping.amount) {
      amount = Math.abs(parseImportNumber(row[mapping.amount]));
      if (!type) type = 'expense';
    } else if (debit || credit) {
      if (debit > 0) { type = 'expense'; amount = Math.abs(debit); }
      else if (credit > 0) { type = 'income'; amount = Math.abs(credit); }
    }
    if (!type) type = 'expense';

    const accountName = mapping.account ? String(row[mapping.account] || '').trim() : '';
    let accountId = findAccountIdByName(accountName);
    if (!accountId) accountId = defaultAccountId;

    const toAccountName = mapping.toAccount ? String(row[mapping.toAccount] || '').trim() : '';
    const toAccountId = mapping.toAccount ? findAccountIdByName(toAccountName) : null;

    const categoryName = mapping.category ? String(row[mapping.category] || '').trim() : '';
    const categoryId = findCategoryIdByName(categoryName, type);

    const note = mapping.note ? String(row[mapping.note] || '').trim() : '';
    const payee = mapping.payee ? String(row[mapping.payee] || '').trim() : '';

    let error = null;
    if (!date) error = 'Tanggal tidak valid';
    else if (!(amount > 0)) error = 'Nominal tidak valid';
    else if (!accountId) error = 'Akun tidak ditemukan';

    const fp = txFingerprint({ date, type, amount, accountId, note });
    const duplicate = !error && (existingFingerprints.has(fp) || seen.has(fp));
    if (!error && !duplicate) seen.add(fp);

    return {
      id: index,
      date,
      type,
      amount,
      accountId,
      toAccountId,
      categoryId,
      note,
      payee,
      accountName,
      categoryName,
      duplicate,
      error,
      selected: !error && !duplicate,
    };
  });

  ui.importPreview = {
    fileName: file.name,
    rows: parsedRows,
    defaultAccountId,
    defaultType: 'expense',
    hasTypeColumn: Boolean(mapping.type || mapping.debit || mapping.credit),
    hasAccountColumn: Boolean(mapping.account),
    headers,
    mapping,
  };

  openImportPreviewModal();
}

export function openImportPreviewModal() {
  const data = ui.importPreview;
  if (!data) return;
  const rows = data.rows;
  const newCount = rows.filter((r) => !r.error && !r.duplicate).length;
  const dupCount = rows.filter((r) => r.duplicate).length;
  const errCount = rows.filter((r) => r.error).length;
  const accountOptionsHtml = store.activeAccounts().map((a) =>
    `<option value="${escapeAttr(a.id)}" ${a.id === data.defaultAccountId ? 'selected' : ''}>${escapeHTML(a.name)}</option>`
  ).join('');
  const previewRows = rows.slice(0, 300);
  const tableRows = previewRows.map((r) => `
    <tr>
      <td><input type="checkbox" name="importRow" value="${r.id}" ${r.selected ? 'checked' : ''} ${r.error ? 'disabled' : ''}></td>
      <td>${escapeHTML(r.date || '—')}</td>
      <td>${escapeHTML(typeLabel(r.type))}</td>
      <td class="text-right">${money(r.amount)}</td>
      <td>${escapeHTML(store.accountName(r.accountId) || '—')}</td>
      <td>${escapeHTML(r.categoryName || '—')}</td>
      <td class="max-w-[10rem] truncate">${escapeHTML(r.note)}</td>
      <td>${r.error
        ? `<span class="text-red-500">${escapeHTML(r.error)}</span>`
        : r.duplicate
          ? `<span class="text-amber-500">Duplikat</span>`
          : `<span class="text-emerald-500">Baru</span>`}</td>
    </tr>`).join('');

  openModal({
    size: 'xl',
    className: 'form-modal',
    html: `<form data-form="import-transactions" class="modal-form" novalidate>
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Import transaksi</p>
          <h2 class="modal-title">${escapeHTML(data.fileName)}</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <div class="grid grid-cols-3 gap-2 text-xs">
          <div class="stat-card stat-green"><div class="stat-top"><span>Baru</span></div><div class="stat-value text-base">${newCount}</div></div>
          <div class="stat-card stat-amber"><div class="stat-top"><span>Duplikat</span></div><div class="stat-value text-base">${dupCount}</div></div>
          <div class="stat-card stat-red"><div class="stat-top"><span>Bermasalah</span></div><div class="stat-value text-base">${errCount}</div></div>
        </div>
        ${!data.hasAccountColumn ? `<label class="field-label mt-3">Akun default
          <select class="field mt-1.5" name="importDefaultAccount">${accountOptionsHtml}</select>
        </label>` : ''}
        ${!data.hasTypeColumn ? `<label class="field-label mt-3">Jenis default
          <select class="field mt-1.5" name="importDefaultType">
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </select>
        </label>` : ''}
        <div class="mt-3 max-h-[45vh] overflow-auto border rounded">
          <table class="report-table text-xs">
            <thead><tr><th></th><th>Tanggal</th><th>Jenis</th><th class="text-right">Nominal</th><th>Akun</th><th>Kategori</th><th>Catatan</th><th>Status</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          ${rows.length > previewRows.length ? `<p class="text-xs text-slate-400 mt-2">Menampilkan ${previewRows.length} dari ${rows.length} baris.</p>` : ''}
        </div>
        <p class="text-[11px] text-slate-400 mt-2">Duplikat terdeteksi otomatis berdasarkan tanggal, jenis, nominal, akun, dan catatan. Anda bisa tetap mencentang untuk mengimpor ulang.</p>
        <p class="form-error hidden" data-form-error role="alert"></p>
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('upload', 'w-4 h-4')} Import terpilih</button>
      </footer>
    </form>`
  });
}

export function downloadImportTemplate(format = 'csv') {
  const headers = ['Tanggal', 'Jenis', 'Nominal', 'Akun', 'Kategori', 'Catatan'];
  const rows = [
    ['05/11/2026', 'Pengeluaran', '50000', 'Dompet Tunai', 'Makanan & Minuman', 'Belanja harian'],
    ['06/11/2026', 'Pemasukan', '100000', 'BCA', 'Gaji', 'Gaji bulan ini'],
    ['07/11/2026', 'Pengeluaran', '25000', 'Dompet Digital', 'Transportasi', 'Bensin motor'],
  ];

  if (format === 'xlsx' && window.XLSX) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template-import-risly.xlsx');
    return;
  }

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, 'template-import-risly.csv');
}

export function openImportFormModal() {
  openModal({
    size: 'md',
    className: 'form-modal',
    html: `<form data-form="import-form" class="modal-form" novalidate>
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Import transaksi</p>
          <h2 class="modal-title">Impor dari file</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Impor transaksi dari file Excel (.xlsx) atau CSV. Kolom yang dibutuhkan:
          <strong>Tanggal, Jenis, Nominal, Akun, Kategori, Catatan</strong>.
        </p>

        <div class="space-y-3">
          <div class="border rounded p-3 bg-slate-50 dark:bg-slate-800/50">
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">Unduh template contoh</p>
            <div class="flex gap-2">
              <button type="button" class="btn btn-secondary btn-sm" data-action="download-template-csv">${icon('file-text', 'w-3 h-3')} CSV</button>
              <button type="button" class="btn btn-secondary btn-sm" data-action="download-template-xlsx">${icon('file-text', 'w-3 h-3')} Excel</button>
            </div>
            <p class="text-[10px] text-slate-500 mt-2">Template berisi kolom contoh yang bisa diisi dan diimpor kembali.</p>
          </div>

          <div class="border rounded p-3 bg-blue-50 dark:bg-blue-500/10">
            <p class="text-xs font-semibold text-blue-700 dark:text-blue-200 mb-2">Format yang didukung</p>
            <ul class="text-[11px] text-slate-600 dark:text-slate-400 list-disc pl-4 mb-0 space-y-1">
              <li>.xlsx, .xls (Excel)</li>
              <li>.csv, .txt, .tsv (teks dipisah koma/tab)</li>
            </ul>
          </div>
        </div>

        <div class="mt-4">
          <button type="button" class="btn btn-primary w-full" data-action="choose-import-file">${icon('upload', 'w-3.5 h-3.5')} Pilih file &amp; mulai impor</button>
        </div>

        <p class="form-error hidden" data-form-error role="alert"></p>
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
      </footer>
    </form>`
  });
}

export function openImportFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.xlsx,.xls,.txt,.tsv';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      await startTransactionImport(file);
    } catch (error) {
      console.error(error);
      toast(error.message || 'Gagal membaca file.', 'error');
    }
  });
  input.click();
}

export async function submitImport(form) {
  const data = ui.importPreview;
  if (!data) { closeModal(); return; }
  const defaultAccount = form.querySelector('select[name="importDefaultAccount"]')?.value || data.defaultAccountId;
  const defaultType = form.querySelector('select[name="importDefaultType"]')?.value || data.defaultType;
  const selectedIds = new Set(Array.from(form.querySelectorAll('input[name="importRow"]:checked')).map((cb) => Number(cb.value)));
  const toImport = data.rows.filter((r) => selectedIds.has(r.id) && !r.error);
  if (!toImport.length) {
    toast('Tidak ada baris yang dipilih.', 'info');
    return;
  }
  toImport.forEach((r) => {
    if (!data.hasAccountColumn) r.accountId = defaultAccount;
    if (!data.hasTypeColumn) r.type = defaultType;
  });
  const invalid = toImport.filter((r) => !r.date || !(r.amount > 0) || !r.accountId);
  if (invalid.length) {
    showFormError(form, `${invalid.length} baris tidak valid (tanggal/nominal/akun).`);
    return;
  }
  let imported = 0;
  for (const r of toImport) {
    store.addTransaction({
      date: r.date,
      time: '00:00',
      type: r.type,
      amount: r.amount,
      accountId: r.accountId,
      toAccountId: r.type === 'transfer' ? r.toAccountId : null,
      categoryId: r.type === 'transfer' ? null : r.categoryId,
      subcategoryId: null,
      note: r.note,
      payee: r.payee || '',
      tags: [],
      createdBy: store.currentUserId,
    });
    imported++;
  }
  closeModal();
  ui.importPreview = null;
  toast(`${imported} transaksi berhasil diimport.`, 'success');
  return imported;
}

/* ------------------------------------------------------------------------ */
/*  form error helper (shared with app.js submit form flow)                */
/* ------------------------------------------------------------------------ */

function showFormError(form, message) {
  const err = form.querySelector('[data-form-error]');
  if (err) {
    err.textContent = message;
    err.classList.remove('hidden');
  }
}
