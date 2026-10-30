import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, money, pageHeader, ui } from '../ui.js';
import {
  buildMonthGrid,
  escapeAttr,
  escapeHTML,
  formatDateLong,
  formatMonth,
  formatPercent,
  monthKey,
  todayISO,
  weekdayLabels,
} from '../utils.js';

export function calendarView() {
  if (!ui.calendarMonth) ui.calendarMonth = monthKey();
  const month = ui.calendarMonth;
  const weekStart = Number(store.data.settings.weekStartsOn) === 0 ? 0 : 1;
  const cells = buildMonthGrid(month, weekStart);
  const weekdays = weekdayLabels(weekStart, 'short');
  const monthTx = store.transactionsForMonth(month);
  const summary = store.summaryForTransactions(monthTx);
  const daily = new Map();
  monthTx.forEach((tx) => {
    if (!daily.has(tx.date)) daily.set(tx.date, { income: 0, expense: 0, count: 0 });
    const entry = daily.get(tx.date);
    if (tx.type === 'income') entry.income += tx.amount;
    if (tx.type === 'expense') entry.expense += tx.amount;
    entry.count += 1;
  });
  const dueNotes = new Map();
  store.notes().filter((note) => note.status === 'active' && note.dueDate).forEach((note) => {
    dueNotes.set(note.dueDate, (dueNotes.get(note.dueDate) || 0) + 1);
  });

  const daysWithSpend = [...daily.entries()].filter(([, value]) => value.expense > 0);
  const highest = daysWithSpend.sort((a, b) => b[1].expense - a[1].expense)[0];
  const averageExpense = daysWithSpend.length
    ? daysWithSpend.reduce((total, [, value]) => total + value.expense, 0) / daysWithSpend.length
    : 0;

  const cellHtml = cells.map((cell) => {
    const entry = daily.get(cell.date);
    const due = dueNotes.get(cell.date) || 0;
    return `<button type="button" class="calendar-cell ${cell.inMonth ? '' : 'is-outside'} ${cell.isToday ? 'is-today' : ''} ${cell.weekend ? 'is-weekend' : ''}" data-action="calendar-day" data-date="${escapeAttr(cell.date)}" aria-label="${escapeAttr(formatDateLong(cell.date))}${entry ? `, pemasukan ${money(entry.income)}, pengeluaran ${money(entry.expense)}` : ''}">
      <span class="calendar-day-number">${cell.day}</span>
      <span class="calendar-day-data">
        ${entry?.income ? `<span class="calendar-amount income">+${money(entry.income, { compact: true })}</span>` : ''}
        ${entry?.expense ? `<span class="calendar-amount expense">-${money(entry.expense, { compact: true })}</span>` : ''}
      </span>
      <span class="calendar-cell-footer">
        ${entry?.count ? `<span class="calendar-count">${entry.count}</span>` : ''}
        ${due ? `<span class="calendar-due" title="${due} catatan/tugas jatuh tempo">${icon('check-square', 'w-2.5 h-2.5')}</span>` : ''}
      </span>
    </button>`;
  }).join('');

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Pola belanja harian',
      title: 'Kalender',
      subtitle: 'Lihat pemasukan dan pengeluaran pada setiap tanggal.',
      actions: `<button type="button" class="btn btn-primary" data-action="add-tx" data-type="expense">${icon('plus', 'w-4 h-4')} Transaksi</button>`,
    })}

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      <div class="stat-card stat-green">
        <div class="stat-top"><span>Pemasukan</span><span class="stat-icon">${icon('arrow-down-left', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(summary.income)}</div>
        <div class="stat-hint">${summary.count} transaksi</div>
      </div>
      <div class="stat-card stat-red">
        <div class="stat-top"><span>Pengeluaran</span><span class="stat-icon">${icon('arrow-up-right', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(summary.expense)}</div>
        <div class="stat-hint">${formatPercent(summary.income > 0 ? (summary.expense / summary.income) * 100 : 0)} dari pemasukan</div>
      </div>
      <div class="stat-card stat-blue">
        <div class="stat-top"><span>Arus kas</span><span class="stat-icon">${icon('trending-up', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl ${summary.net < 0 ? 'amount-expense' : ''}">${summary.net > 0 ? '+' : ''}${money(summary.net)}</div>
        <div class="stat-hint">Bulan ${escapeHTML(formatMonth(month, { month: 'long' }))}</div>
      </div>
      <div class="stat-card stat-amber">
        <div class="stat-top"><span>Rata-rata harian</span><span class="stat-icon">${icon('calendar', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(averageExpense)}</div>
        <div class="stat-hint">${highest ? `Tertinggi ${money(highest[1].expense, { compact: true })}` : 'Belum ada pengeluaran'}</div>
      </div>
    </div>

    <section class="card calendar-card">
      <div class="calendar-toolbar">
        <div class="month-nav">
          <button type="button" class="icon-btn" data-action="calendar-prev" aria-label="Bulan sebelumnya">${icon('chevron-left')}</button>
          <div class="month-nav-label">${escapeHTML(formatMonth(month))}</div>
          <button type="button" class="icon-btn" data-action="calendar-next" aria-label="Bulan berikutnya">${icon('chevron-right')}</button>
        </div>
        <div class="flex items-center gap-2">
          <input type="month" class="field field-compact hidden sm:block" id="calendar-month-picker" value="${escapeAttr(month)}" data-filter="calendar-month" aria-label="Pilih bulan">
          <button type="button" class="btn btn-secondary btn-sm" data-action="calendar-today">Hari ini</button>
        </div>
      </div>

      <div class="calendar-weekdays">
        ${weekdays.map((label) => `<span>${escapeHTML(label)}</span>`).join('')}
      </div>
      <div class="calendar-grid">${cellHtml}</div>

      <div class="calendar-legend">
        <span><b class="legend-dot" style="--legend-color:#16A34A"></b> Pemasukan</span>
        <span><b class="legend-dot" style="--legend-color:#F04452"></b> Pengeluaran</span>
        <span>${icon('check-square', 'w-3 h-3')} Jatuh tempo tugas</span>
        <span class="ml-auto hidden sm:inline">${badge('Ketuk tanggal untuk rincian', 'slate', 'badge-soft')}</span>
      </div>
    </section>

    <div class="grid md:grid-cols-2 gap-4">
      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Insight</p>
            <h2 class="section-title">Hari paling aktif</h2>
          </div>
          ${icon('sparkles', 'w-5 h-5 text-amber-500')}
        </div>
        ${highest ? `<div class="insight-hero">
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Pengeluaran terbesar</p>
            <p class="text-lg font-bold text-slate-900 dark:text-white mt-1">${escapeHTML(formatDateLong(highest[0], { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          </div>
          <p class="text-xl font-bold amount-expense">${money(highest[1].expense)}</p>
        </div>` : '<p class="text-sm text-slate-500 dark:text-slate-400">Belum ada data pengeluaran bulan ini.</p>'}
      </section>
      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Ritme keluarga</p>
            <h2 class="section-title">Catatan kalender</h2>
          </div>
          ${icon('calendar', 'w-5 h-5 text-blue-500')}
        </div>
        <p class="text-sm leading-6 text-slate-500 dark:text-slate-400">Total harian dihitung dari transaksi pemasukan dan pengeluaran. Transfer antar akun tidak dihitung sebagai arus kas, tetapi tetap mengubah saldo akun.</p>
        <button type="button" class="link-button mt-3" data-action="nav" data-route="reports">Buka laporan bulanan ${icon('arrow-right', 'w-3 h-3')}</button>
      </section>
    </div>
  </div>`;
}
