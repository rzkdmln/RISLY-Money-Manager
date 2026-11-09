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
  shiftMonthKey,
  todayISO,
} from '../utils.js';

export function reportsView() {
  if (!ui.reportMonth) ui.reportMonth = monthKey();
  const month = ui.reportMonth;
  if (!ui.reportRangeStart) ui.reportRangeStart = `${month}-01`;
  if (!ui.reportRangeEnd) {
    const [y, m] = month.split('-');
    const last = new Date(Number(y), Number(m), 0).getDate();
    ui.reportRangeEnd = `${month}-${String(last).padStart(2, '0')}`;
  }
  const summary = store.monthSummary(month);
  const closing = store.closingForMonth(month);
  const categories = store.expenseByCategory(month);
  const categoriesTotal = categories.reduce((total, item) => total + item.total, 0);
  const creators = store.creatorBreakdown(month);
  const transactions = store.transactionsForMonth(month);
  const accounts = store.activeAccounts();
  const savingsTone = summary.savingsRate >= 20 ? 'green' : summary.savingsRate >= 0 ? 'amber' : 'red';
  const topCategory = categories[0];
  const expenseTransactions = transactions.filter((tx) => tx.type === 'expense');
  const average = expenseTransactions.length ? expenseTransactions.reduce((total, tx) => total + tx.amount, 0) / expenseTransactions.length : 0;

  return `<div class="page-stack">
    ${pageHeader({
      title: 'Laporan',
      actions: `<div class="flex flex-col items-end gap-2">
            <div class="month-nav budget-month-nav"><button type="button" class="icon-btn" data-action="budget-prev" data-target="report" aria-label="Bulan sebelumnya"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button><input type="month" class="field field-compact budget-month-input" id="budget-month-picker" value="${escapeAttr(month)}" data-filter="budget-month" data-target="report" aria-label="Pilih bulan anggaran"><button type="button" class="icon-btn" data-action="budget-next" data-target="report" aria-label="Bulan berikutnya"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></button></div>
            <button type="button" class="btn btn-secondary text-blue-600 hover:text-blue-700 dark:text-blue-400 flex-none" data-action="open-export-modal">${icon('download', 'w-4 h-4')} Unduh</button>
          </div>`,
    })}

    <section class="card report-control">
      <div class="flex items-center gap-3">
        <span class="report-month-icon">${icon('calendar', 'w-5 h-5')}</span>
        <div class="min-w-0">
          <p class="card-kicker">Periode laporan</p>
          <p class="text-lg font-bold text-slate-900 dark:text-white">${escapeHTML(formatMonth(month))}</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2"></div>
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

    <section class="card">
      <div class="card-heading">
        <div>
          <p class="card-kicker">Buku buku</p>
          <h2 class="section-title">Tutup buku · ${escapeHTML(formatMonth(month))}</h2>
        </div>
        ${closing.closed ? badge('Bulan tertutup', 'blue', 'badge-soft') : badge('Belum ditutup', 'slate', 'badge-soft')}
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 min-w-0 w-full">
        <div class="stat-card stat-green min-w-0 overflow-hidden">
          <div class="stat-top min-w-0"><span class="truncate">Pemasukan</span><span class="stat-icon shrink-0">${icon('arrow-down-left', 'w-4 h-4')}</span></div>
          <div class="stat-value text-base sm:text-xl truncate">${money(closing.income)}</div>
          <div class="stat-hint truncate">${closing.count} transaksi</div>
        </div>
        <div class="stat-card stat-red min-w-0 overflow-hidden">
          <div class="stat-top min-w-0"><span class="truncate">Pengeluaran</span><span class="stat-icon shrink-0">${icon('arrow-up-right', 'w-4 h-4')}</span></div>
          <div class="stat-value text-base sm:text-xl truncate">${money(closing.expense)}</div>
          <div class="stat-hint truncate">${closing.topCategory ? `Terbesar: ${closing.topCategory.name}` : 'Tanpa pengeluaran'}</div>
        </div>
        <div class="stat-card stat-blue min-w-0 overflow-hidden">
          <div class="stat-top min-w-0"><span class="truncate">Arus kas bersih</span><span class="stat-icon shrink-0">${icon('trending-up', 'w-4 h-4')}</span></div>
          <div class="stat-value text-base sm:text-xl truncate ${closing.net < 0 ? 'amount-expense' : ''}">${closing.net > 0 ? '+' : ''}${money(closing.net)}</div>
          <div class="stat-hint truncate">${formatPercent(closing.savingsRate)} tabungan</div>
        </div>
        <div class="stat-card stat-amber min-w-0 overflow-hidden">
          <div class="stat-top min-w-0"><span class="truncate">Rata-rata harian</span><span class="stat-icon shrink-0">${icon('calendar', 'w-4 h-4')}</span></div>
          <div class="stat-value text-base sm:text-xl truncate">${money(closing.average)}</div>
          <div class="stat-hint truncate">${closing.transfers ? `Transfer ${money(closing.transfers)}` : 'Tanpa transfer'}</div>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 mt-4">
        <div class="flex flex-wrap items-center gap-2">
          ${closing.closed
            ? `<span class="badge badge-soft">Buku tertutup</span>`
            : `<span class="badge badge-soft">Buku masih terbuka</span>`}
          ${store.isMonthLocked(month) ? `<span class="badge badge-soft" title="${store.lockedMonths().find((e) => e.month === month)?.lockedBy || '—'}">${icon('lock', 'w-3 h-3')} Terkunci</span>` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${closing.closed
            ? `<button type="button" class="btn btn-secondary btn-sm" data-action="reopen-month">${icon('unlock', 'w-3.5 h-3.5')} Buka kembali</button>`
            : `<button type="button" class="btn btn-primary btn-sm" data-action="close-month">${icon('lock', 'w-3.5 h-3.5')} Tutup buku</button>`}
        </div>
      </div>
    </section>

    <div class="grid lg:grid-cols-5 gap-4">
      <section class="card lg:col-span-3">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Distribusi</p>
            <h2 class="section-title">Pengeluaran per kategori</h2>
          </div>
          ${badge(`${categories.length} kategori`, 'slate', 'badge-soft')}
        </div>
        ${categories.length ? `<div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Kategori</th><th class="text-right">Jumlah</th><th class="text-right">%</th></tr></thead>
            <tbody>
              ${categories.map((item) => {
                const percent = categoriesTotal > 0 ? (item.total / categoriesTotal) * 100 : 0;
                return `<tr>
                  <td><span class="flex items-center gap-2 min-w-0"><span class="legend-dot" style="--legend-color:${escapeAttr(item.color)}"></span><span class="font-medium text-slate-800 dark:text-slate-100">${escapeHTML(item.name)}</span></span></td>
                  <td class="text-right font-semibold">${money(item.total)}</td>
                  <td class="text-right text-slate-500 dark:text-slate-400">${formatPercent(percent, 1)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
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
        ${creators.length ? `<div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Pencatat</th><th class="text-right">Transaksi</th><th class="text-right">Masuk</th><th class="text-right">Keluar</th></tr></thead>
            <tbody>
              ${creators.map((creator) => `<tr>
                <td><span class="flex items-center gap-2"><span class="creator-avatar" style="--creator-color:${escapeAttr(store.getUser(creator.userId)?.color || 'var(--muted)')}">${escapeHTML(creator.name.slice(0, 1))}</span><span class="font-medium text-slate-800 dark:text-slate-100">${escapeHTML(creator.name)}</span></span></td>
                <td class="text-right">${creator.count}</td>
                <td class="text-right amount-income">+${money(creator.income)}</td>
                <td class="text-right amount-expense">-${money(creator.expense)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p class="text-sm text-slate-500">Belum ada data pencatat.</p>'}
        <div class="report-divider"></div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-500 dark:text-slate-400">Rata-rata pengeluaran</span>
          <strong class="text-slate-900 dark:text-white">${money(average)}</strong>
        </div>
        <div class="flex items-center justify-between text-sm mt-2">
          <span class="text-slate-500 dark:text-slate-400">Transfer</span>
          <strong class="text-slate-900 dark:text-white">${money(summary.transfers)}</strong>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-heading">
        <div>
          <p class="card-kicker">Perbandingan</p>
          <h2 class="section-title">Bulan ini vs bulan lalu</h2>
        </div>
        ${icon('trending-up', 'w-5 h-5 text-blue-500')}
      </div>
      ${(() => {
        const prev = shiftMonthKey(month, -1);
        const prevSummary = store.monthSummary(prev);
        const rows = [
          { label: 'Pemasukan', current: summary.income, previous: prevSummary.income },
          { label: 'Pengeluaran', current: summary.expense, previous: prevSummary.expense },
          { label: 'Arus kas bersih', current: summary.net, previous: prevSummary.net },
        ];
        return `<div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Metrik</th><th class="text-right">Bulan ini</th><th class="text-right">Bulan lalu</th></tr></thead>
            <tbody>
              ${rows.map((row) => {
                const diff = row.current - row.previous;
                return `<tr>
                  <td>${escapeHTML(row.label)}</td>
                  <td class="text-right font-semibold">${money(row.current)}</td>
                  <td class="text-right">${money(row.previous)} <span class="${diff >= 0 ? 'text-emerald-500' : 'text-red-500'} text-[11px]">${diff >= 0 ? '+' : ''}${money(diff)}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="report-divider"></div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-500 dark:text-slate-400">Tingkat tabungan bulan ini</span>
          <strong class="text-slate-900 dark:text-white">${formatPercent(summary.savingsRate)}</strong>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-500 dark:text-slate-400">Tingkat tabungan bulan lalu</span>
          <strong class="text-slate-900 dark:text-white">${formatPercent(prevSummary.savingsRate)}</strong>
        </div>`;
      })()}
    </section>

    <div class="grid lg:grid-cols-2 gap-4">
      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Kontribusi</p>
            <h2 class="section-title">Belanja per anggota</h2>
          </div>
          ${icon('users', 'w-5 h-5 text-violet-500')}
        </div>
        <div class="space-y-3">
          ${store.memberSpending(month).length
            ? store.memberSpending(month).map((member) => `<div class="creator-row">
                <span class="creator-avatar" style="--creator-color:${escapeAttr(member.color || 'var(--muted)')}">${escapeHTML(member.name.slice(0, 1))}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold text-slate-800 dark:text-slate-100">${escapeHTML(member.name)}</span><span class="text-xs text-slate-500">${member.count} transaksi</span></div>
                  <div class="flex items-center gap-3 mt-1 text-[11px]">
                    <span class="amount-income">+${money(member.income)}</span>
                    <span class="amount-expense">-${money(member.expense)}</span>
                  </div>
                </div>
              </div>`).join('')
            : '<p class="text-sm text-slate-500">Belum ada data anggota.</p>'}
        </div>
      </section>

      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Tren</p>
            <h2 class="section-title">Kategori vs bulan lalu</h2>
          </div>
          ${icon('chart-pie', 'w-5 h-5 text-blue-500')}
        </div>
        ${store.categoryTrend(month, 8).length
          ? `<div class="table-wrap">
              <table class="report-table">
                <thead><tr><th>Kategori</th><th class="text-right">Bulan lalu</th><th class="text-right">Bulan ini</th><th class="text-right">Selisih</th></tr></thead>
                <tbody>
                  ${store.categoryTrend(month, 8).map((item) => {
                    const tone = item.diff > 0 ? 'text-red-500' : item.diff < 0 ? 'text-emerald-500' : 'text-slate-400';
                    return `<tr>
                      <td><span class="flex items-center gap-2 min-w-0"><span class="legend-dot" style="--legend-color:${escapeAttr(item.color)}"></span><span class="font-medium text-slate-800 dark:text-slate-100">${escapeHTML(item.name)}</span></span></td>
                      <td class="text-right">${money(item.previous)}</td>
                      <td class="text-right font-semibold">${money(item.current)}</td>
                      <td class="text-right ${tone} font-semibold">${item.diff >= 0 ? '+' : ''}${money(item.diff)}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`
          : '<p class="text-sm text-slate-500">Belum ada pengeluaran pada periode ini.</p>'}
      </section>
    </div>

    <div class="grid lg:grid-cols-5 gap-4">
      <section class="card lg:col-span-2">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Posisi saat ini</p>
            <h2 class="section-title">Saldo akun</h2>
          </div>
          <button type="button" class="link-button" data-action="nav" data-route="accounts">Kelola</button>
        </div>
        ${accounts.length ? `<div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Akun</th><th class="text-right">Saldo</th></tr></thead>
            <tbody>
              ${accounts.map((account) => `<tr>
                <td><span class="flex items-center gap-2 min-w-0"><span class="legend-dot" style="--legend-color:${escapeAttr(account.color)}"></span><span class="font-medium text-slate-800 dark:text-slate-100">${escapeHTML(account.name)}</span></span></td>
                <td class="text-right font-semibold ${store.accountBalance(account.id) < 0 ? 'amount-expense' : 'text-slate-900 dark:text-white'}">${money(store.accountBalance(account.id))}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p class="text-sm text-slate-500">Belum ada akun.</p>'}
        <div class="report-divider"></div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-slate-700 dark:text-slate-200">Kekayaan bersih</span>
          <strong class="text-lg text-slate-900 dark:text-white">${money(store.totalBalance())}</strong>
        </div>
      </section>
    </div>

    ${store.netWorthHistory().length ? `<section class="card">
      <div class="card-heading"><div><p class="card-kicker">Riwayat</p><h2 class="section-title">Kekayaan bersih per bulan</h2></div></div>
      <div class="space-y-2">${store.netWorthHistory().slice(-12).reverse().map((entry) => `<div class="flex items-center justify-between text-sm"><span class="text-slate-600 dark:text-slate-300">${escapeHTML(entry.month)}</span><strong class="text-slate-900 dark:text-white">${money(entry.value)}</strong></div>`).join('')}</div>
    </section>` : ''}
  </div>`;
}

