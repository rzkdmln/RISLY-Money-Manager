import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, money, pageHeader, progressBar, toneForPercent, ui } from '../ui.js';
import {
  escapeAttr,
  escapeHTML,
  formatMonth,
  formatPercent,
  monthKey,
  safeNumber,
  shiftMonthKey,
} from '../utils.js';

export function budgetsView() {
  if (!ui.budgetMonth) ui.budgetMonth = monthKey();
  const month = ui.budgetMonth;
  const status = store.budgetStatus(month);
  const summary = store.monthSummary(month);
  const tone = toneForPercent(status.percent, status.warning, status.danger);
  const hasBudget = status.total > 0;
  const categories = status.categories;

  const allocated = categories.reduce((sum, item) => sum + safeNumber(item.limit), 0);
  const unallocated = status.total - allocated;
  const unallocatedText = status.total > 0
    ? 'Tidak teralokasi ke kategori: ' + money(Math.max(0, unallocated)) + (unallocated < 0 ? ' (melebihi total)' : '') + '.'
    : '';

  return '<div class="page-stack">' +
    pageHeader({
      eyebrow: 'Rencana belanja',
      title: 'Anggaran',
      subtitle: '',
      actions: '',
    }) +

    '<section class="card">' +
      '<div class="calendar-toolbar budget-toolbar">' +
        '<div class="month-nav budget-month-nav">' +
          '<button type="button" class="icon-btn" data-action="budget-prev" aria-label="Bulan sebelumnya">' + icon('chevron-left') + '</button>' +
          '<input type="month" class="field field-compact budget-month-input" id="budget-month-picker" value="' + escapeAttr(month) + '" data-filter="budget-month" aria-label="Pilih bulan anggaran">' +
          '<button type="button" class="icon-btn" data-action="budget-next" aria-label="Bulan berikutnya">' + icon('chevron-right') + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="budget-hero mt-4">' +
        '<div class="budget-hero-main">' +
          '<div>' +
            '<p class="card-kicker">Total anggaran ' + escapeHTML(formatMonth(month, { month: 'long' })) + '</p>' +
            '<p class="budget-hero-value">' + (hasBudget ? money(status.total) : 'Belum diatur') + '</p>' +
            '<button type="button" class="btn btn-ghost btn-sm mt-2" data-action="copy-budget" title="Salin anggaran bulan sebelumnya">' + icon('copy', 'w-3.5 h-3.5') + ' Salin bulan lalu</button>' +
            '<button type="button" class="btn btn-ghost btn-sm mt-2" data-action="carry-budget" title="Bawa anggaran bulan sebelumnya">' + icon('arrow-left', 'w-3.5 h-3.5') + ' Bawa dari bulan lalu</button>' +
          '</div>' +
          '<form data-form="budget-total" class="budget-set-form">' +
            '<label class="field-label">Atur total' +
              '<div class="input-with-prefix mt-1.5">' +
                '<span>Rp</span>' +
                '<input class="field" type="number" name="amount" min="0" step="1000" inputmode="numeric" value="' + Math.round(status.total) + '" placeholder="0">' +
              '</div>' +
            '</label>' +
            '<button type="submit" class="btn btn-primary">' + icon('save', 'w-4 h-4') + ' Simpan</button>' +
          '</form>' +
        '</div>' +
        (hasBudget ? '<div class="budget-hero-progress">' +
          '<div class="flex items-end justify-between gap-3 mb-2">' +
            '<div>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400">Terpakai</p>' +
              '<p class="text-lg font-bold text-slate-900 dark:text-white">' + money(status.spent) + ' <span class="text-xs font-medium text-slate-400">dari ' + money(status.total) + '</span></p>' +
            '</div>' +
            '<span class="budget-percent badge badge-' + (tone === 'over' || tone === 'danger' ? 'red' : tone === 'warning' ? 'amber' : 'green') + '">' + formatPercent(status.percent) + '</span>' +
          '</div>' +
          progressBar(status.percent, tone, 'progress-lg') +
          '<div class="budget-scale budget-scale-four">' +
            '<span>0%</span><span>' + status.warning + '%</span><span>' + status.danger + '%</span><span>100%</span>' +
          '</div>' +
          '<div class="grid grid-cols-3 gap-2 mt-4">' +
            '<div class="budget-metric"><span>Pemasukan</span><strong class="amount-income">' + money(summary.income) + '</strong></div>' +
            '<div class="budget-metric"><span>Sisa</span><strong class="' + (status.remaining < 0 ? 'amount-expense' : '') + '">' + money(Math.abs(status.remaining)) + '</strong></div>' +
            '<div class="budget-metric"><span>Harian aman</span><strong>' + money(sisaHarian(status.remaining, month)) + '</strong></div>' +
          '</div>' +
          (unallocatedText ? '<p class="text-[11px] text-slate-400 mt-2">' + unallocatedText + '</p>' : '') +
          (status.remaining < 0 ? '<p class="budget-alert mt-3">' + icon('alert-triangle', 'w-3.5 h-3.5') + ' Anggaran terlampaui ' + money(Math.abs(status.remaining)) + '.</p>' : status.percent >= status.warning ? '<p class="budget-alert budget-alert-warning mt-3">' + icon('info', 'w-3.5 h-3.5') + ' ' + (status.percent >= status.danger ? 'Sangat dekat' : 'Mendekati') + ' batas anggaran. Sisa harian aman ' + money(sisaHarian(status.remaining, month)) + '.</p>' : '<p class="budget-alert budget-alert-safe mt-3">' + icon('check-circle', 'w-3.5 h-3.5') + ' Arus kas masih sehat. Pertahankan ritme belanja.</p>') +
        '</div>' : '<p class="text-sm leading-6 text-slate-500 dark:text-slate-400">Isi total anggaran untuk melihat progres, sisa dana, dan rekomendasi batas belanja harian.</p>') +
      '</div>' +
    '</section>' +

    '<form data-form="budget-categories" class="card">' +
      '<div class="card-heading">' +
        '<div>' +
          '<p class="card-kicker">Batas per kategori</p>' +
          '<h2 class="section-title">Kendali pengeluaran</h2>' +

        '</div>' +
        '<button type="submit" class="btn btn-secondary btn-sm">' + icon('save', 'w-3.5 h-3.5') + ' Simpan</button>' +
      '</div>' +
      '<div class="budget-category-list">' +
        (categories.map((item) => {
          const rowTone = toneForPercent(item.percent, status.warning, status.danger);
          return '<div class="budget-category-row">' +
            '<div class="budget-cat-head">' +
              '<span class="tx-icon" style="--tx-color:' + escapeAttr(item.category.color) + '">' + icon(item.category.icon, 'w-4 h-4') + '</span>' +
              '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-semibold text-slate-900 dark:text-white truncate">' + escapeHTML(item.category.name) + '</p>' +
                '<p class="text-[11px] text-slate-500 dark:text-slate-400">' + money(item.spent) + ' terpakai' + (item.limit ? ' · ' + formatPercent(item.percent) : ' · belum ada batas') + '</p>' +
              '</div>' +
              '<div class="budget-input">' +
                '<span>Rp</span>' +
                '<input type="number" name="budget_' + escapeAttr(item.category.id) + '" min="0" step="1000" inputmode="numeric" value="' + Math.round(item.limit || 0) + '" aria-label="Batas ' + escapeAttr(item.category.name) + '">' +
              '</div>' +
            '</div>' +
            (item.limit ? progressBar(item.percent, rowTone, 'progress-thin') + (item.remaining < 0 ? '<p class="budget-cat-over">Lebih ' + money(Math.abs(item.remaining)) + '</p>' : '') : '') +
          '</div>';
        }).join('') || '<p class="text-sm text-slate-500">Belum ada kategori pengeluaran.</p>') +
      '</div>' +
    '</form>' +

    '<div class="grid md:grid-cols-2 gap-4">' +
      '<form data-form="budget-thresholds" class="card">' +
        '<div class="card-heading">' +
          '<div>' +
            '<p class="card-kicker">Warna peringatan</p>' +
            '<h2 class="section-title">Ambang batas</h2>' +
          '</div>' +
          '<button type="submit" class="btn btn-secondary btn-sm">Simpan</button>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<label class="field-label">Peringatan (%)' +
            '<input class="field mt-1.5" type="number" name="warning" min="1" max="99" value="' + status.warning + '">' +
          '</label>' +
          '<label class="field-label">Bahaya (%)' +
            '<input class="field mt-1.5" type="number" name="danger" min="2" max="100" value="' + status.danger + '">' +
          '</label>' +
        '</div>' +
        '<div class="threshold-preview mt-4">' +
          '<span class="bg-emerald-500">Aman</span>' +
          '<span class="bg-amber-500">Peringatan &gt;= ' + status.warning + '%</span>' +
          '<span class="bg-red-500">Bahaya &gt;= ' + status.danger + '%</span>' +
        '</div>' +
      '</form>' +
    '</div>' +
  '</div>';
}

function sisaHarian(remaining, month) {
  if (remaining <= 0) return 0;
  const parts = String(month || '').split('-');
  const year = Number(parts[0]);
  const monthNumber = Number(parts[1]);
  const daysInMonth = Number.isFinite(year) && Number.isFinite(monthNumber)
    ? new Date(year, monthNumber, 0).getDate()
    : 30;
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && monthNumber === now.getMonth() + 1;
  const daysLeft = isCurrentMonth
    ? Math.max(1, daysInMonth - now.getDate() + 1)
    : Math.max(1, daysInMonth);
  return remaining / daysLeft;
}
