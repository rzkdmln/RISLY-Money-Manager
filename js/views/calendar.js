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
      title: 'Kalender',
      actions: `<button type="button" class="btn btn-primary flex-none" data-action="add-tx" data-type="expense">${icon('plus', 'w-4 h-4')} Transaksi</button>`,
    })}

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
        <span><b class="legend-dot" style="--legend-color:var(--green)"></b> Pemasukan</span>
        <span><b class="legend-dot" style="--legend-color:var(--red)"></b> Pengeluaran</span>
        <span>${icon('check-square', 'w-3 h-3')} Jatuh tempo tugas</span>
      </div>
    </section>
  </div>`;
}

