import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, money, pageHeader, ui } from '../ui.js';
import { escapeAttr, escapeHTML, formatDateLong, normalizeSearch } from '../utils.js';
import { dayGroupHeader, transactionDayGroups, txRow } from './common.js';

function filterTransactions() {
  let list = store.transactions();

  // Filter berdasarkan Tahun
  if (ui.txYear && ui.txYear !== 'all') {
    list = list.filter((tx) => {
      const txYear = tx.date.split('-')[0]; // Format YYYY
      return txYear === ui.txYear;
    });
  }

  // Filter berdasarkan Bulan
  if (ui.txMonth && ui.txMonth !== 'all') {
    list = list.filter((tx) => {
      const txMonth = tx.date.split('-')[1]; // Format MM
      return txMonth === ui.txMonth;
    });
  }

  if (ui.txType !== 'all') list = list.filter((tx) => tx.type === ui.txType);
  if (ui.txAccount !== 'all') {
    list = list.filter((tx) => tx.accountId === ui.txAccount || tx.toAccountId === ui.txAccount);
  }
  if (ui.txCategory !== 'all') list = list.filter((tx) => tx.categoryId === ui.txCategory);
  if (ui.txUser !== 'all') list = list.filter((tx) => tx.createdBy === ui.txUser);

  if (ui.txQuery.trim()) {
    const query = normalizeSearch(ui.txQuery);
    list = list.filter((tx) => {
      const category = store.categoryById(tx.categoryId);
      const sub = tx.subcategoryId ? store.subcategoryById(tx.categoryId, tx.subcategoryId) : null;
      const account = store.accountById(tx.accountId);
      const toAccount = store.accountById(tx.toAccountId);
      const haystack = normalizeSearch([
        tx.note,
        category?.name,
        sub?.name,
        account?.name,
        toAccount?.name,
        tx.createdByName,
        tx.amount,
        tx.date,
      ].join(' '));
      return haystack.includes(query);
    });
  }

  return list;
}

export function transactionsView() {
  const currentYear = new Date().getFullYear();
  const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');

  // Inisialisasi default jika belum ada
  if (!ui.txYear) ui.txYear = currentYear.toString();
  if (!ui.txMonth || ui.txMonth.length > 2) ui.txMonth = currentMonthStr;

  const all = filterTransactions();
  const summary = store.summaryForTransactions(all);
  const groups = transactionDayGroups(all.slice(0, ui.txLimit));
  const categories = store.categories();
  const accounts = store.data.accounts.filter((account) => !account.deletedAt);
  const users = store.activeUsers();

  // Buat opsi tahun otomatis dinamis
  const startYear = 2026;
  let yearOptions = `<option value="all" ${ui.txYear === 'all' ? 'selected' : ''}>Semua tahun</option>`;
  for (let y = currentYear; y >= startYear; y--) {
    yearOptions += `<option value="${y}" ${ui.txYear === y.toString() ? 'selected' : ''}>${y}</option>`;
  }

  const groupHtml = groups.length
    ? groups.map((group) => `<section class="day-group min-w-0 w-full overflow-hidden">
        ${dayGroupHeader(group.date, group.summary)}
        <div class="tx-list min-w-0 w-full">${group.items.map((tx) => txRow(tx)).join('')}</div>
      </section>`).join('')
    : emptyState('search', 'Tidak ada transaksi', ui.txQuery || ui.txType !== 'all' || ui.txAccount !== 'all' ? 'Coba ubah filter atau kata pencarian.' : 'Belum ada transaksi pada periode ini.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-tx" data-type="expense">${icon('plus', 'w-3.5 h-3.5')} Catat transaksi</button>`);

  return `<div class="page-stack min-w-0 w-full overflow-hidden">
    ${pageHeader({
      eyebrow: 'Buku kas',
      title: 'Transaksi',
      subtitle: 'Catat, cari, dan rapikan setiap aliran uang keluarga.',
      actions: `<button type="button" class="btn btn-secondary hidden sm:inline-flex" data-action="nav" data-route="recurring">${icon('repeat', 'w-4 h-4')} Berulang</button>
        <button type="button" class="btn btn-primary" data-action="add-tx" data-type="expense">${icon('plus', 'w-4 h-4')} Tambah</button>`,
    })}

    <div class="grid grid-cols-3 gap-2.5 sm:gap-4 min-w-0 w-full">
      <div class="stat-card stat-green min-w-0 overflow-hidden">
        <div class="stat-top min-w-0"><span class="truncate">Pemasukan</span><span class="stat-icon shrink-0">${icon('arrow-down-left', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl truncate">${money(summary.income)}</div>
        <div class="stat-hint truncate">${summary.count} transaksi</div>
      </div>
      <div class="stat-card stat-red min-w-0 overflow-hidden">
        <div class="stat-top min-w-0"><span class="truncate">Pengeluaran</span><span class="stat-icon shrink-0">${icon('arrow-up-right', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl truncate">${money(summary.expense)}</div>
        <div class="stat-hint truncate">${summary.transfers ? `${money(summary.transfers, { compact: true })} transfer` : 'di luar transfer'}</div>
      </div>
      <div class="stat-card stat-blue min-w-0 overflow-hidden">
        <div class="stat-top min-w-0"><span class="truncate">Arus kas</span><span class="stat-icon shrink-0">${icon('trending-up', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl truncate ${summary.net < 0 ? 'amount-expense' : ''}">${summary.net > 0 ? '+' : ''}${money(summary.net)}</div>
        <div class="stat-hint truncate">${summary.income > 0 ? `${Math.round(summary.savingsRate)}% tersimpan` : 'pemasukan − pengeluaran'}</div>
      </div>
    </div>

    <section class="card filter-card min-w-0 w-full overflow-hidden">
      <div class="filter-top min-w-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="filter-title shrink-0">${icon('filter', 'w-4 h-4')} Filter</span>${ui.txMonth === 'all' && ui.txYear === 'all' ? badge('Semua waktu', 'blue', 'badge-soft') : ''}
        </div>
        <button type="button" class="link-button shrink-0" data-action="reset-tx-filter">Reset</button>
      </div>
      <div class="filter-grid min-w-0 w-full">
        <label class="field-label min-w-0">Tahun
          <select class="field mt-1.5 min-w-0 w-full" id="tx-filter-year" data-filter="tx-year">
            ${yearOptions}
          </select>
        </label>
        <label class="field-label min-w-0">Bulan
          <select class="field mt-1.5 min-w-0 w-full" id="tx-filter-month" data-filter="tx-month">
            <option value="all" ${ui.txMonth === 'all' ? 'selected' : ''}>Semua bulan</option>
            <option value="01" ${ui.txMonth === '01' ? 'selected' : ''}>Januari</option>
            <option value="02" ${ui.txMonth === '02' ? 'selected' : ''}>Februari</option>
            <option value="03" ${ui.txMonth === '03' ? 'selected' : ''}>Maret</option>
            <option value="04" ${ui.txMonth === '04' ? 'selected' : ''}>April</option>
            <option value="05" ${ui.txMonth === '05' ? 'selected' : ''}>Mei</option>
            <option value="06" ${ui.txMonth === '06' ? 'selected' : ''}>Juni</option>
            <option value="07" ${ui.txMonth === '07' ? 'selected' : ''}>Juli</option>
            <option value="08" ${ui.txMonth === '08' ? 'selected' : ''}>Agustus</option>
            <option value="09" ${ui.txMonth === '09' ? 'selected' : ''}>September</option>
            <option value="10" ${ui.txMonth === '10' ? 'selected' : ''}>Oktober</option>
            <option value="11" ${ui.txMonth === '11' ? 'selected' : ''}>November</option>
            <option value="12" ${ui.txMonth === '12' ? 'selected' : ''}>Desember</option>
          </select>
        </label>
        <label class="field-label min-w-0">Jenis
          <select class="field mt-1.5 min-w-0 w-full" id="tx-filter-type" data-filter="tx-type">
            <option value="all" ${ui.txType === 'all' ? 'selected' : ''}>Semua jenis</option>
            <option value="expense" ${ui.txType === 'expense' ? 'selected' : ''}>Pengeluaran</option>
            <option value="income" ${ui.txType === 'income' ? 'selected' : ''}>Pemasukan</option>
            <option value="transfer" ${ui.txType === 'transfer' ? 'selected' : ''}>Transfer</option>
          </select>
        </label>
        <label class="field-label min-w-0">Akun
          <select class="field mt-1.5 min-w-0 w-full" id="tx-filter-account" data-filter="tx-account">
            <option value="all">Semua akun</option>
            ${accounts.map((account) => `<option value="${escapeAttr(account.id)}" ${ui.txAccount === account.id ? 'selected' : ''}>${escapeHTML(account.name)}${account.archived ? ' (arsip)' : ''}</option>`).join('')}
          </select>
        </label>
        <label class="field-label min-w-0">Kategori
          <select class="field mt-1.5 min-w-0 w-full" id="tx-filter-category" data-filter="tx-category">
            <option value="all">Semua kategori</option>
            <optgroup label="Pengeluaran">
              ${categories.filter((cat) => cat.type === 'expense').map((cat) => `<option value="${escapeAttr(cat.id)}" ${ui.txCategory === cat.id ? 'selected' : ''}>${escapeHTML(cat.name)}</option>`).join('')}
            </optgroup>
            <optgroup label="Pemasukan">
              ${categories.filter((cat) => cat.type === 'income').map((cat) => `<option value="${escapeAttr(cat.id)}" ${ui.txCategory === cat.id ? 'selected' : ''}>${escapeHTML(cat.name)}</option>`).join('')}
            </optgroup>
          </select>
        </label>
        <label class="field-label min-w-0">Pencatat
          <select class="field mt-1.5 min-w-0 w-full" id="tx-filter-user" data-filter="tx-user">
            <option value="all">Semua</option>
            ${users.map((user) => `<option value="${escapeAttr(user.id)}" ${ui.txUser === user.id ? 'selected' : ''}>${escapeHTML(user.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field-label filter-search min-w-0">Cari
          <span class="search-field mt-1.5 min-w-0 w-full">
            ${icon('search', 'w-4 h-4')}
            <input class="field min-w-0 w-full" id="tx-search" type="search" inputmode="search" placeholder="Catatan, kategori, akun…" value="${escapeAttr(ui.txQuery)}">
          </span>
        </label>
      </div>
      <div class="filter-bottom min-w-0">
        <button type="button" class="link-button shrink-0" data-action="tx-all-months">${icon('calendar', 'w-3.5 h-3.5')} Tampilkan semua waktu</button>
        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0 overflow-hidden">
          ${badge(`${all.length} hasil`, 'slate', 'badge-soft')}
          ${summary.transfers ? `<span class="truncate">Transfer ${money(summary.transfers)}</span>` : ''}
        </div>
      </div>
    </section>

    <div class="space-y-5 min-w-0 w-full">${groupHtml}</div>

    ${all.length > ui.txLimit ? `<div class="flex justify-center pt-2 min-w-0">
      <button type="button" class="btn btn-secondary" data-action="tx-load-more">Muat ${Math.min(40, all.length - ui.txLimit)} transaksi lagi</button>
    </div>` : ''}
  </div>`;
}

export function dayDetailView(date) {
  const list = store.transactionsForDate(date);
  const summary = store.summaryForTransactions(list);
  return `<div class="p-5 sm:p-6 min-w-0 w-full overflow-hidden">
    <div class="flex items-start justify-between gap-3 min-w-0">
      <div class="min-w-0 flex-1">
        <p class="page-eyebrow">Rincian harian</p>
        <h2 class="text-xl font-bold text-slate-900 dark:text-white mt-1 truncate">${escapeHTML(formatDateLong(date))}</h2>
        <div class="flex flex-wrap gap-2 mt-2 min-w-0">
          ${summary.income ? badge(`Masuk ${money(summary.income)}`, 'green', 'badge-soft') : ''}
          ${summary.expense ? badge(`Keluar ${money(summary.expense)}`, 'red', 'badge-soft') : ''}
          ${!summary.income && !summary.expense ? badge('Tidak ada transaksi', 'slate', 'badge-soft') : ''}
        </div>
      </div>
      <button type="button" class="icon-btn shrink-0" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </div>
    <div class="mt-5 min-w-0 w-full">
      ${list.length ? `<div class="tx-list min-w-0 w-full">${list.map((tx) => txRow(tx, { showCreator: true })).join('')}</div>` : emptyState('calendar', 'Hari ini masih tenang', 'Tidak ada transaksi pada tanggal ini.')}
    </div>
    <div class="mt-5 grid grid-cols-2 gap-2.5 min-w-0 w-full">
      <button type="button" class="btn btn-secondary truncate" data-action="add-tx" data-type="income" data-date="${escapeAttr(date)}">${icon('arrow-down-left', 'w-4 h-4')} Pemasukan</button>
      <button type="button" class="btn btn-primary truncate" data-action="add-tx" data-type="expense" data-date="${escapeAttr(date)}">${icon('plus', 'w-4 h-4')} Pengeluaran</button>
    </div>
  </div>`;
}
