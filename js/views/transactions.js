import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, money, pageHeader, ui } from '../ui.js';
import { escapeAttr, escapeHTML, formatDateLong, monthKey, monthRange, normalizeSearch } from '../utils.js';
import { dayGroupHeader, transactionDayGroups, txRow } from './common.js';

function filterTransactions() {
  let list = store.transactions();
  if (ui.txMonth !== 'all') {
    const range = monthRange(ui.txMonth || monthKey());
    list = list.filter((tx) => tx.date >= range.start && tx.date <= range.end);
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
  if (!ui.txMonth) ui.txMonth = monthKey();
  const all = filterTransactions();
  const summary = store.summaryForTransactions(all);
  const groups = transactionDayGroups(all.slice(0, ui.txLimit));
  const categories = store.categories();
  const accounts = store.data.accounts.filter((account) => !account.deletedAt);
  const users = store.activeUsers();
  const monthValue = ui.txMonth === 'all' ? '' : ui.txMonth;

  const groupHtml = groups.length
    ? groups.map((group) => `<section class="day-group">
        ${dayGroupHeader(group.date, group.summary)}
        <div class="tx-list">${group.items.map((tx) => txRow(tx)).join('')}</div>
      </section>`).join('')
    : emptyState('search', 'Tidak ada transaksi', ui.txQuery || ui.txType !== 'all' || ui.txAccount !== 'all' ? 'Coba ubah filter atau kata pencarian.' : 'Belum ada transaksi pada periode ini.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-tx" data-type="expense">${icon('plus', 'w-3.5 h-3.5')} Catat transaksi</button>`);

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Buku kas',
      title: 'Transaksi',
      subtitle: 'Catat, cari, dan rapikan setiap aliran uang keluarga.',
      actions: `<button type="button" class="btn btn-secondary hidden sm:inline-flex" data-action="nav" data-route="recurring">${icon('repeat', 'w-4 h-4')} Berulang</button>
        <button type="button" class="btn btn-primary" data-action="add-tx" data-type="expense">${icon('plus', 'w-4 h-4')} Tambah</button>`,
    })}

    <div class="grid grid-cols-3 gap-2.5 sm:gap-4">
      <div class="stat-card stat-green">
        <div class="stat-top"><span>Pemasukan</span><span class="stat-icon">${icon('arrow-down-left', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(summary.income)}</div>
        <div class="stat-hint">${summary.count} transaksi</div>
      </div>
      <div class="stat-card stat-red">
        <div class="stat-top"><span>Pengeluaran</span><span class="stat-icon">${icon('arrow-up-right', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(summary.expense)}</div>
        <div class="stat-hint">${summary.transfers ? `${money(summary.transfers, { compact: true })} transfer` : 'di luar transfer'}</div>
      </div>
      <div class="stat-card stat-blue">
        <div class="stat-top"><span>Arus kas</span><span class="stat-icon">${icon('trending-up', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl ${summary.net < 0 ? 'amount-expense' : ''}">${summary.net > 0 ? '+' : ''}${money(summary.net)}</div>
        <div class="stat-hint">${summary.income > 0 ? `${Math.round(summary.savingsRate)}% tersimpan` : 'pemasukan − pengeluaran'}</div>
      </div>
    </div>

    <section class="card filter-card">
      <div class="filter-top">
        <div class="flex items-center gap-2">
          <span class="filter-title">${icon('filter', 'w-4 h-4')} Filter</span>
          ${ui.txMonth === 'all' ? badge('Semua waktu', 'blue', 'badge-soft') : ''}
        </div>
        <button type="button" class="link-button" data-action="reset-tx-filter">Reset</button>
      </div>
      <div class="filter-grid">
        <label class="field-label">Bulan
          <input class="field mt-1.5" type="month" id="tx-filter-month" value="${escapeAttr(monthValue)}" data-filter="tx-month">
        </label>
        <label class="field-label">Jenis
          <select class="field mt-1.5" id="tx-filter-type" data-filter="tx-type">
            <option value="all" ${ui.txType === 'all' ? 'selected' : ''}>Semua jenis</option>
            <option value="expense" ${ui.txType === 'expense' ? 'selected' : ''}>Pengeluaran</option>
            <option value="income" ${ui.txType === 'income' ? 'selected' : ''}>Pemasukan</option>
            <option value="transfer" ${ui.txType === 'transfer' ? 'selected' : ''}>Transfer</option>
          </select>
        </label>
        <label class="field-label">Akun
          <select class="field mt-1.5" id="tx-filter-account" data-filter="tx-account">
            <option value="all">Semua akun</option>
            ${accounts.map((account) => `<option value="${escapeAttr(account.id)}" ${ui.txAccount === account.id ? 'selected' : ''}>${escapeHTML(account.name)}${account.archived ? ' (arsip)' : ''}</option>`).join('')}
          </select>
        </label>
        <label class="field-label">Kategori
          <select class="field mt-1.5" id="tx-filter-category" data-filter="tx-category">
            <option value="all">Semua kategori</option>
            <optgroup label="Pengeluaran">
              ${categories.filter((cat) => cat.type === 'expense').map((cat) => `<option value="${escapeAttr(cat.id)}" ${ui.txCategory === cat.id ? 'selected' : ''}>${escapeHTML(cat.name)}</option>`).join('')}
            </optgroup>
            <optgroup label="Pemasukan">
              ${categories.filter((cat) => cat.type === 'income').map((cat) => `<option value="${escapeAttr(cat.id)}" ${ui.txCategory === cat.id ? 'selected' : ''}>${escapeHTML(cat.name)}</option>`).join('')}
            </optgroup>
          </select>
        </label>
        <label class="field-label">Pencatat
          <select class="field mt-1.5" id="tx-filter-user" data-filter="tx-user">
            <option value="all">Semua</option>
            ${users.map((user) => `<option value="${escapeAttr(user.id)}" ${ui.txUser === user.id ? 'selected' : ''}>${escapeHTML(user.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field-label filter-search">Cari
          <span class="search-field mt-1.5">
            ${icon('search', 'w-4 h-4')}
            <input class="field" id="tx-search" type="search" inputmode="search" placeholder="Catatan, kategori, akun…" value="${escapeAttr(ui.txQuery)}">
          </span>
        </label>
      </div>
      <div class="filter-bottom">
        <button type="button" class="link-button" data-action="tx-all-months">${icon('calendar', 'w-3.5 h-3.5')} Tampilkan semua waktu</button>
        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          ${badge(`${all.length} hasil`, 'slate', 'badge-soft')}
          ${summary.transfers ? `<span>Transfer ${money(summary.transfers)}</span>` : ''}
        </div>
      </div>
    </section>

    <div class="space-y-5">${groupHtml}</div>

    ${all.length > ui.txLimit ? `<div class="flex justify-center pt-2">
      <button type="button" class="btn btn-secondary" data-action="tx-load-more">Muat ${Math.min(40, all.length - ui.txLimit)} transaksi lagi</button>
    </div>` : ''}
  </div>`;
}

export function dayDetailView(date) {
  const list = store.transactionsForDate(date);
  const summary = store.summaryForTransactions(list);
  return `<div class="p-5 sm:p-6">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="page-eyebrow">Rincian harian</p>
        <h2 class="text-xl font-bold text-slate-900 dark:text-white mt-1">${escapeHTML(formatDateLong(date))}</h2>
        <div class="flex flex-wrap gap-2 mt-2">
          ${summary.income ? badge(`Masuk ${money(summary.income)}`, 'green', 'badge-soft') : ''}
          ${summary.expense ? badge(`Keluar ${money(summary.expense)}`, 'red', 'badge-soft') : ''}
          ${!summary.income && !summary.expense ? badge('Tidak ada transaksi', 'slate', 'badge-soft') : ''}
        </div>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </div>
    <div class="mt-5">
      ${list.length ? `<div class="tx-list">${list.map((tx) => txRow(tx, { showCreator: true })).join('')}</div>` : emptyState('calendar', 'Hari ini masih tenang', 'Tidak ada transaksi pada tanggal ini.')}
    </div>
    <div class="mt-5 grid grid-cols-2 gap-2.5">
      <button type="button" class="btn btn-secondary" data-action="add-tx" data-type="income" data-date="${escapeAttr(date)}">${icon('arrow-down-left', 'w-4 h-4')} Pemasukan</button>
      <button type="button" class="btn btn-primary" data-action="add-tx" data-type="expense" data-date="${escapeAttr(date)}">${icon('plus', 'w-4 h-4')} Pengeluaran</button>
    </div>
  </div>`;
}
