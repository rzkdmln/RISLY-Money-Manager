import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { money, pageHeader, ui } from '../ui/ui.js';
import {
  escapeAttr,
  escapeHTML,
  formatDate,
  formatMonth,
  formatPercent,
  monthKey,
} from '../core/utils.js';

/* -------------------------------------------------------------------------- */
/*  Helper: label kategori lengkap                                            */
/* -------------------------------------------------------------------------- */

function categoryLabel(tx) {
  if (tx.type === 'transfer') return 'Transfer';
  const category = store.categoryById(tx.categoryId);
  const sub = tx.subcategoryId ? store.subcategoryById(tx.categoryId, tx.subcategoryId) : null;
  if (category && sub) return `${category.name} / ${sub.name}`;
  return category?.name || 'Tanpa kategori';
}

/* -------------------------------------------------------------------------- */
/*  Helper: label akun                                                        */
/* -------------------------------------------------------------------------- */

function accountLabel(tx) {
  if (tx.type === 'transfer') {
    return `${store.accountName(tx.accountId)} → ${store.accountName(tx.toAccountId)}`;
  }
  if (Array.isArray(tx.payments) && tx.payments.length) {
    return tx.payments.map((p) => store.accountName(p.accountId)).join(' + ');
  }
  return store.accountName(tx.accountId) || '—';
}

/* -------------------------------------------------------------------------- */
/*  Helper: format tanggal pendek                                             */
/* -------------------------------------------------------------------------- */

function formatDateShort(dateISO) {
  if (!dateISO) return '—';
  const d = new Date(dateISO + 'T00:00:00');
  const options = { day: '2-digit', month: 'short', year: '2-digit' };
  return d.toLocaleDateString('id-ID', options);
}

/* -------------------------------------------------------------------------- */
/*  Main view                                                                 */
/* -------------------------------------------------------------------------- */

export function reportsView() {
  if (!ui.reportMonth) ui.reportMonth = monthKey();
  const month = ui.reportMonth;
  if (!ui.reportRangeStart) ui.reportRangeStart = `${month}-01`;
  if (!ui.reportRangeEnd) {
    const [y, m] = month.split('-');
    const last = new Date(Number(y), Number(m), 0).getDate();
    ui.reportRangeEnd = `${month}-${String(last).padStart(2, '0')}`;
  }

  const start = ui.reportRangeStart;
  const end = ui.reportRangeEnd;
  const list = store.transactionsBetween(start, end);
  const summary = store.summaryForTransactions(list);
  const incomeTx = list.filter((tx) => tx.type === 'income');
  const expenseTx = list.filter((tx) => tx.type === 'expense');
  const transferTx = list.filter((tx) => tx.type === 'transfer');

  // Running balance (saldo bertumbuh) untuk rekening koran
  let runningBalance = 0;
  const rowsWithBalance = list.map((tx) => {
    if (tx.type === 'income') runningBalance += Number(tx.amount) || 0;
    else if (tx.type === 'expense') runningBalance -= Number(tx.amount) || 0;
    else if (tx.type === 'transfer') runningBalance -= Number(tx.amount) || 0;
    return { ...tx, runningBalance };
  });

  const incomeTotal = summary.income || 0;
  const expenseTotal = summary.expense || 0;
  const netTotal = summary.net || 0;
  const txCount = list.length;

  const savingsLabel =
    netTotal >= 0 ? 'Surplus' : netTotal >= -incomeTotal * 0.2 ? 'Cukup' : 'Defisit';

  const periodLabel = start === end
    ? formatDate(start)
    : `${formatDate(start)} – ${formatDate(end)}`;

  return `<div class="page-stack min-w-0 w-full overflow-hidden">
    ${pageHeader({
      title: 'Laporan Keuangan',
      actions: `<div class="flex items-center gap-3">
            <div class="month-nav budget-month-nav"><button type="button" class="icon-btn" data-action="budget-prev" data-target="report" aria-label="Bulan sebelumnya"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button><input type="month" class="field field-compact budget-month-input" id="budget-month-picker" value="${escapeAttr(month)}" data-filter="budget-month" data-target="report" aria-label="Pilih bulan laporan"><button type="button" class="icon-btn" data-action="budget-next" data-target="report" aria-label="Bulan berikutnya"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></button></div>
            <button type="button" class="btn btn-secondary text-blue-600 hover:text-blue-700 dark:text-blue-400 flex-none" data-action="open-export-modal">${icon('download', 'w-4 h-4')} Unduh Laporan</button>
          </div>`,
    })}

    <!-- RINGKASAN PERIODE -->
    <section class="card min-w-0 w-full overflow-hidden">
      <div class="card-heading min-w-0">
        <div class="min-w-0 flex-1">
          <p class="card-kicker">Ringkasan · ${escapeHTML(periodLabel)}</p>
          <h2 class="section-title truncate">Kesehatan Keuangan</h2>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 p-4">
        <div class="stat-card stat-green">
          <div class="stat-top"><span>Pemasukan</span><span class="stat-icon">${icon('arrow-down-left', 'w-4 h-4')}</span></div>
          <div class="stat-value text-base sm:text-xl">+${money(incomeTotal)}</div>
          <div class="stat-hint">${incomeTx.length} transaksi</div>
        </div>
        <div class="stat-card stat-red">
          <div class="stat-top"><span>Pengeluaran</span><span class="stat-icon">${icon('arrow-up-right', 'w-4 h-4')}</span></div>
          <div class="stat-value text-base sm:text-xl">-${money(expenseTotal)}</div>
          <div class="stat-hint">${expenseTx.length} transaksi</div>
        </div>
        <div class="stat-card stat-blue">
          <div class="stat-top"><span>Arus kas bersih</span><span class="stat-icon">${icon('trending-up', 'w-4 h-4')}</span></div>
          <div class="stat-value text-base sm:text-xl ${netTotal < 0 ? 'amount-expense' : ''}">${netTotal > 0 ? '+' : ''}${money(netTotal)}</div>
          <div class="stat-hint">${savingsLabel} · ${formatPercent(summary.savingsRate)}</div>
        </div>
        <div class="stat-card stat-amber">
          <div class="stat-top"><span>Transfer</span><span class="stat-icon">${icon('arrow-left-right', 'w-4 h-4')}</span></div>
          <div class="stat-value text-base sm:text-xl">${money(summary.transfers || 0)}</div>
          <div class="stat-hint">${transferTx.length} transaksi</div>
        </div>
      </div>
    </section>

    <!-- FILTER CEPAT -->
    <section class="card min-w-0 w-full overflow-hidden p-4">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Filter cepat</span>
        <button type="button" class="filter-chip ${ui.txType === 'all' || !ui.txType ? 'is-active' : ''}" data-action="tx-filter-type" data-type="all">Semua</button>
        <button type="button" class="filter-chip ${ui.txType === 'income' ? 'is-active' : ''}" data-action="tx-filter-type" data-type="income">Pemasukan</button>
        <button type="button" class="filter-chip ${ui.txType === 'expense' ? 'is-active' : ''}" data-action="tx-filter-type" data-type="expense">Pengeluaran</button>
        <button type="button" class="filter-chip ${ui.txType === 'transfer' ? 'is-active' : ''}" data-action="tx-filter-type" data-type="transfer">Transfer</button>
        <div class="ml-auto flex items-center gap-2">
          <button type="button" class="btn btn-secondary btn-sm" data-action="open-export-modal">${icon('download', 'w-3.5 h-3.5')} Unduh</button>
        </div>
      </div>
    </section>

    <!-- DAFTAR TRANSAKSI (REKENING KORAN) -->
    <section class="card min-w-0 w-full overflow-hidden mt-4">
      <div class="card-heading min-w-0">
        <div class="min-w-0 flex-1">
          <p class="card-kicker">Rekening Koran</p>
          <h2 class="section-title truncate">Transaksi ${escapeHTML(periodLabel)}</h2>
        </div>
        <span class="badge badge-soft">${txCount} transaksi</span>
      </div>

      ${txCount ? `
      <div class="overflow-x-auto">
        <table class="report-table w-full text-left">
          <thead>
            <tr>
              <th class="w-20">Tanggal</th>
              <th class="min-w-0">Keterangan</th>
              <th class="w-48 text-right">Kategori</th>
              <th class="w-48 text-right">Akun</th>
              <th class="w-16 text-center">Tipe</th>
              <th class="w-32 text-right">Nominal</th>
              <th class="w-32 text-right">Saldo</th>
              <th class="w-16 text-center">Pencatat</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
            ${rowsWithBalance.map((tx) => {
              const cat = tx.type === 'transfer' ? 'Transfer' : categoryLabel(tx);
              const isIncome = tx.type === 'income';
              const isExpense = tx.type === 'expense';
              const amountColor = isIncome ? 'text-emerald-600 dark:text-emerald-400' : isExpense ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400';
              const sign = isIncome ? '+' : isExpense ? '–' : '↻';
              const createdBy = store.getUser(tx.createdBy);
              const creatorName = tx.createdByName || createdBy?.name || '—';
              const creatorColor = createdBy?.color || '#94A3B8';
              return `<tr class="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td class="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  <span class="block font-medium text-slate-900 dark:text-slate-100">${formatDateShort(tx.date)}</span>
                  <span class="block text-[10px] text-slate-400">${tx.time || '—'}</span>
                </td>
                <td class="min-w-0">
                  <div class="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">${escapeHTML(tx.note || cat)}</div>
                  ${tx.note ? `<div class="text-[11px] text-slate-400 truncate">${escapeHTML(cat)}</div>` : ''}
                </td>
                <td class="text-sm text-slate-600 dark:text-slate-300 text-right truncate">${escapeHTML(cat)}</td>
                <td class="text-sm text-slate-600 dark:text-slate-300 text-right truncate">${escapeHTML(accountLabel(tx))}</td>
                <td class="text-center">
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isIncome ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : isExpense ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400' : 'bg-slate-50 text-slate-700 dark:bg-slate-800/20 dark:text-slate-300'}">
                    ${isIncome ? 'Masuk' : isExpense ? 'Keluar' : 'Transfer'}
                  </span>
                </td>
                <td class="text-sm font-semibold text-right ${amountColor}">${sign}${money(Number(tx.amount))}</td>
                <td class="text-sm font-mono font-semibold text-right text-slate-600 dark:text-slate-300">${money(Math.max(0, tx.runningBalance))}</td>
                <td class="text-center">
                  <span class="inline-flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full" style="background-color:${escapeAttr(creatorColor)}"></span>
                    <span class="text-[10px] text-slate-500 dark:text-slate-400 truncate">${escapeHTML(creatorName.slice(0, 12))}</span>
                  </span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="pt-3 pb-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <div class="text-sm text-slate-600 dark:text-slate-300">
          Saldo akhir periode: <strong class="text-slate-900 dark:text-white">${money(Math.max(0, runningBalance))}</strong>
        </div>
        <div class="text-xs text-slate-400">Saldo bertumbuh dari saldo awal periode</div>
      </div>
      ` : `
      <div class="p-8 text-center">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          ${icon('receipt', 'w-8 h-8 text-slate-400')}
        </div>
        <h3 class="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Belum ada transaksi</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
          Tidak ada transaksi pada periode ${escapeHTML(periodLabel)}. Coba ubah rentang tanggal atau catat transaksi terlebih dahulu.
        </p>
        <div class="flex justify-center">
          <button type="button" class="btn btn-primary btn-sm" data-action="add-tx" data-type="expense">${icon('plus', 'w-3.5 h-3.5')} Catat Transaksi</button>
        </div>
      </div>
      `}
    </section>

    <!-- RINGKASAN PER KATEGORI (ringkas) -->
    ${store.expenseByCategory(month).length ? `
    <section class="card min-w-0 w-full overflow-hidden mt-4">
      <div class="card-heading min-w-0">
        <div class="min-w-0 flex-1">
          <p class="card-kicker">Distribusi</p>
          <h2 class="section-title truncate">Pengeluaran per Kategori ${escapeHTML(formatMonth(month))}</h2>
        </div>
      </div>
      <div class="p-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          ${(() => {
            const catList = store.expenseByCategory(month);
            const categoriesTotal = catList.reduce((t, i) => t + i.total, 0);
            return catList.slice(0, 8).map((item) => {
              const percent = categoriesTotal > 0 ? (item.total / categoriesTotal) * 100 : 0;
              return `<div class="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">${escapeHTML(item.name)}</span>
                <span class="text-[11px] font-bold text-slate-900 dark:text-slate-100">-${money(item.total)}</span>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-1 overflow-hidden">
                <div class="bg-blue-500 h-1.5 rounded-full" style="width:${Math.min(100, percent)}%"></div>
              </div>
              <span class="text-[10px] text-slate-400">${percent.toFixed(0)}% dari total pengeluaran</span>
            </div>`;
            }).join('');
          })()}
        </div>
      </div>
    </section>
    ` : ''}
  </div>`;
}


