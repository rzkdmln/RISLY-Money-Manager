import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, money, pageHeader, progressBar, ui } from '../ui.js';
import {
  escapeAttr,
  escapeHTML,
  formatDate,
  formatMonth,
  formatPercent,
  monthKey,
  todayISO,
} from '../utils.js';

export function reportsView() {
  if (!ui.reportMonth) ui.reportMonth = monthKey();
  const month = ui.reportMonth;
  const summary = store.monthSummary(month);
  const categories = store.expenseByCategory(month);
  const categoriesTotal = categories.reduce((total, item) => total + item.total, 0);
  const creators = store.creatorBreakdown(month);
  const transactions = store.transactionsForMonth(month);
  const accounts = store.activeAccounts();
  const savingsTone = summary.savingsRate >= 20 ? 'green' : summary.savingsRate >= 0 ? 'amber' : 'red';
  const topCategory = categories[0];
  const average = transactions.length ? transactions.reduce((total, tx) => total + tx.amount, 0) / transactions.length : 0;

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Analisis & ekspor',
      title: 'Laporan',
      subtitle: 'Rangkuman bulanan siap dibaca, dicetak, dan dibagikan.',
      actions: `<button type="button" class="btn btn-secondary" data-action="export-xlsx-all">${icon('download', 'w-4 h-4')} Excel semua</button>
        <button type="button" class="btn btn-primary" data-action="export-pdf">${icon('file-text', 'w-4 h-4')} PDF bulan ini</button>`,
    })}

    <section class="card report-control">
      <div class="flex items-center gap-3">
        <span class="report-month-icon">${icon('calendar', 'w-5 h-5')}</span>
        <div class="min-w-0">
          <p class="card-kicker">Periode laporan</p>
          <p class="text-lg font-bold text-slate-900 dark:text-white">${escapeHTML(formatMonth(month))}</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <input type="month" class="field field-compact" id="report-month-picker" value="${escapeAttr(month)}" data-filter="report-month" aria-label="Pilih bulan laporan">
        <button type="button" class="btn btn-secondary btn-sm" data-action="export-xlsx-month">${icon('download', 'w-3.5 h-3.5')} Excel bulan ini</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="export-pdf">${icon('file-text', 'w-3.5 h-3.5')} PDF</button>
      </div>
    </section>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      <div class="stat-card stat-green">
        <div class="stat-top"><span>Pemasukan</span><span class="stat-icon">${icon('arrow-down-left', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(summary.income)}</div>
        <div class="stat-hint">${transactions.filter((tx) => tx.type === 'income').length} transaksi</div>
      </div>
      <div class="stat-card stat-red">
        <div class="stat-top"><span>Pengeluaran</span><span class="stat-icon">${icon('arrow-up-right', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(summary.expense)}</div>
        <div class="stat-hint">${transactions.filter((tx) => tx.type === 'expense').length} transaksi</div>
      </div>
      <div class="stat-card stat-blue">
        <div class="stat-top"><span>Arus kas bersih</span><span class="stat-icon">${icon('trending-up', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl ${summary.net < 0 ? 'amount-expense' : ''}">${summary.net > 0 ? '+' : ''}${money(summary.net)}</div>
        <div class="stat-hint">${summary.savingsRate >= 0 ? 'surplus' : 'defisit'} bulan ini</div>
      </div>
      <div class="stat-card stat-amber">
        <div class="stat-top"><span>Tingkat tabungan</span><span class="stat-icon">${icon('piggy-bank', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${formatPercent(summary.savingsRate)}</div>
        <div class="stat-hint">${badge(`${savingsTone === 'green' ? 'Sehat' : savingsTone === 'amber' ? 'Cukup' : 'Perlu perhatian'}`, savingsTone, 'badge-soft')}</div>
      </div>
    </div>

    <div class="grid lg:grid-cols-5 gap-4">
      <section class="card lg:col-span-3">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Distribusi</p>
            <h2 class="section-title">Pengeluaran per kategori</h2>
          </div>
          ${badge(`${categories.length} kategori`, 'slate', 'badge-soft')}
        </div>
        ${categories.length ? `<div class="report-category-list">
          ${categories.map((item) => {
            const percent = categoriesTotal > 0 ? (item.total / categoriesTotal) * 100 : 0;
            return `<div class="report-category-row">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="legend-dot" style="--legend-color:${escapeAttr(item.color)}"></span>
                <span class="text-sm text-slate-700 dark:text-slate-200 truncate">${escapeHTML(item.name)}</span>
              </div>
              <div class="report-category-bar">${progressBar(percent, 'info', 'progress-thin')}</div>
              <span class="report-category-amount">${money(item.total)}</span>
              <span class="report-category-percent">${formatPercent(percent, 1)}</span>
            </div>`;
          }).join('')}
        </div>` : '<p class="text-sm text-slate-500 dark:text-slate-400">Belum ada pengeluaran pada bulan ini.</p>'}
        ${topCategory ? `<div class="report-highlight"><span>${icon('chart-pie', 'w-4 h-4')}</span><p>Kategori terbesar: <strong>${escapeHTML(topCategory.name)}</strong> — ${money(topCategory.total)} (${formatPercent(categoriesTotal ? (topCategory.total / categoriesTotal) * 100 : 0, 1)})</p></div>` : ''}
      </section>

      <section class="card lg:col-span-2">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Kontribusi</p>
            <h2 class="section-title">Siapa mencatat?</h2>
          </div>
          ${icon('users', 'w-5 h-5 text-violet-500')}
        </div>
        <div class="space-y-3">
          ${creators.length ? creators.map((creator) => `<div class="creator-row">
            <span class="creator-avatar" style="--creator-color:${escapeAttr(store.getUser(creator.userId)?.color || '#64748B')}">${escapeHTML(creator.name.slice(0, 1))}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold text-slate-800 dark:text-slate-100">${escapeHTML(creator.name)}</span><span class="text-xs text-slate-500">${creator.count} transaksi</span></div>
              <div class="flex items-center gap-3 mt-1 text-[11px]">
                <span class="amount-income">+${money(creator.income)}</span>
                <span class="amount-expense">-${money(creator.expense)}</span>
              </div>
            </div>
          </div>`).join('') : '<p class="text-sm text-slate-500">Belum ada data pencatat.</p>'}
        </div>
        <div class="report-divider"></div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-500 dark:text-slate-400">Rata-rata nominal</span>
          <strong class="text-slate-900 dark:text-white">${money(average)}</strong>
        </div>
        <div class="flex items-center justify-between text-sm mt-2">
          <span class="text-slate-500 dark:text-slate-400">Transfer</span>
          <strong class="text-slate-900 dark:text-white">${money(summary.transfers)}</strong>
        </div>
      </section>
    </div>

    <div class="grid lg:grid-cols-5 gap-4">
      <section class="card lg:col-span-3">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Pratinjau</p>
            <h2 class="section-title">Transaksi bulan ini</h2>
          </div>
          <button type="button" class="link-button" data-action="nav" data-route="transactions">Lihat semua</button>
        </div>
        ${transactions.length ? `<div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Akun</th><th class="text-right">Nominal</th></tr></thead>
            <tbody>
              ${transactions.slice(0, 10).map((tx) => {
                const category = store.categoryById(tx.categoryId);
                return `<tr>
                  <td class="whitespace-nowrap">${escapeHTML(formatDate(tx.date, { day: '2-digit', month: 'short' }))}</td>
                  <td><span class="font-medium text-slate-800 dark:text-slate-100">${escapeHTML(tx.note || category?.name || (tx.type === 'transfer' ? 'Transfer' : 'Transaksi'))}</span><span class="block text-[10px] text-slate-400">${escapeHTML(category?.name || (tx.type === 'transfer' ? 'Transfer antar akun' : '—'))}</span></td>
                  <td>${escapeHTML(store.accountName(tx.accountId))}</td>
                  <td class="text-right ${tx.type === 'income' ? 'amount-income' : tx.type === 'expense' ? 'amount-expense' : 'amount-transfer'}">${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${money(tx.amount)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : '<p class="text-sm text-slate-500 dark:text-slate-400">Belum ada transaksi pada periode ini.</p>'}
      </section>

      <section class="card lg:col-span-2">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Posisi saat ini</p>
            <h2 class="section-title">Saldo akun</h2>
          </div>
          <button type="button" class="link-button" data-action="nav" data-route="accounts">Kelola</button>
        </div>
        <div class="space-y-3">
          ${accounts.map((account) => `<div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0"><span class="legend-dot" style="--legend-color:${escapeAttr(account.color)}"></span><span class="text-sm text-slate-600 dark:text-slate-300 truncate">${escapeHTML(account.name)}</span></div>
            <strong class="text-sm ${store.accountBalance(account.id) < 0 ? 'amount-expense' : 'text-slate-900 dark:text-white'}">${money(store.accountBalance(account.id))}</strong>
          </div>`).join('') || '<p class="text-sm text-slate-500">Belum ada akun.</p>'}
        </div>
        <div class="report-divider"></div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-slate-700 dark:text-slate-200">Kekayaan bersih</span>
          <strong class="text-lg text-slate-900 dark:text-white">${money(store.totalBalance())}</strong>
        </div>
      </section>
    </div>

    <section class="export-card">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[.18em] text-blue-600 dark:text-blue-400">Ekspor & cetak</p>
        <h2 class="text-lg font-bold text-slate-900 dark:text-white mt-1">Bawa laporan ke mana saja</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Excel memuat seluruh riwayat. PDF diformat landscape dengan ringkasan dan tabel transaksi, siap dicetak.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-secondary" data-action="export-xlsx-all">${icon('download', 'w-4 h-4')} Semua riwayat (.xlsx)</button>
        <button type="button" class="btn btn-secondary" data-action="export-xlsx-month">${icon('download', 'w-4 h-4')} Bulan ini (.xlsx)</button>
        <button type="button" class="btn btn-primary" data-action="export-pdf">${icon('file-text', 'w-4 h-4')} Laporan PDF</button>
      </div>
    </section>
    <p class="text-[11px] text-slate-400 text-center">Laporan dibuat pada ${escapeHTML(formatDate(todayISO(), { day: 'numeric', month: 'long', year: 'numeric' }))} · ${escapeHTML(store.data.settings.householdName)}</p>
  </div>`;
}
