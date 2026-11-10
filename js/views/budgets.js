import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { badge, money, pageHeader, progressBar, toneForPercent, ui } from '../ui/ui.js';
import {
  escapeAttr,
  escapeHTML,
  formatMonth,
  formatPercent,
  monthKey,
  safeNumber,
  shiftMonthKey,
} from '../core/utils.js';

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
  const unallocatedText = status.total > 0 && Math.abs(unallocated) > 0
    ? 'Tidak teralokasi ke kategori: ' + money(Math.max(0, unallocated)) + (unallocated < 0 ? ' (melebihi total)' : '') + '.'
    : '';

  return '<div class="page-stack">' +
    pageHeader({
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
            '<p class="budget-hero-value">' + (hasBudget ? money(status.total) : 'Belum diatur') + '</p>' +
            '' +
          '</div>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="open-budget-categories">' + icon('edit', 'w-3.5 h-3.5') + ' Edit anggaran</button>' +
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
        '</div>' : '<p class="text-sm leading-6 text-slate-500 dark:text-slate-400">Atur batas kategori untuk melihat progres, sisa dana, dan rekomendasi batas belanja harian.</p>') +
      '</div>' +
    '</section>' +
    '<section class="card mt-4">' +
      '<div class="card-heading">' +
        '<div><p class="card-kicker">Rincian</p><h2 class="section-title">Batas per kategori</h2></div>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table class="report-table">' +
          '<thead><tr><th>Kategori</th><th class="text-right">Terpakai</th><th class="text-right">Batas</th><th class="text-right">%</th></tr></thead>' +
          '<tbody>' + categories.map((item) => {
            return '<tr>' +
              '<td><span class="flex items-center gap-2 min-w-0"><span class="legend-dot" style="--legend-color:' + escapeAttr(item.category.color) + '"></span><span class="font-medium text-slate-800 dark:text-slate-100">' + escapeHTML(item.category.name) + '</span></span></td>' +
              '<td class="text-right">' + money(item.spent) + '</td>' +
              '<td class="text-right">' + (item.limit ? money(item.limit) : '-') + '</td>' +
              '<td class="text-right">' + (item.limit ? formatPercent(item.percent) : '-') + '</td>' +
            '</tr>';
          }).join('') + (categories.length ? '' : '<tr><td colspan="4" class="text-center text-slate-400">Belum ada kategori.</td></tr>') +
          '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="report-divider"></div>' +
      '<div class="flex items-center justify-between">' +
        '<span class="text-sm font-semibold text-slate-700 dark:text-slate-200">Total</span>' +
        '<strong class="text-lg text-slate-900 dark:text-white">' + money(status.total) + '</strong>' +
      '</div>' +
    '</section>' +
    '' +
  '</div>';
}

export function budgetCategoriesModal(month) {
  const targetMonth = month || ui.budgetMonth || monthKey();
  const status = store.budgetStatus(targetMonth);
  const categories = status.categories;
  const rowHtml = categories.map((item) => {
    const rowTone = toneForPercent(item.percent, status.warning, status.danger);
    return '<div class="budget-category-row">' +
      '<div class="budget-cat-head">' +
        '<span class="tx-icon" style="--tx-color:' + escapeAttr(item.category.color) + '">' + icon(item.category.icon, 'w-4 h-4') + '</span>' +
        '<div class="min-w-0 flex-1">' +
          '<p class="text-sm font-semibold text-slate-900 dark:text-white truncate">' + escapeHTML(item.category.name) + '</p>' +
          '<p class="budget-cat-meta text-[11px] text-slate-500 dark:text-slate-400">' + money(item.spent) + ' terpakai' + (item.limit ? ' · ' + formatPercent(item.percent) : '') + '</p>' +
        '</div>' +
        '<button type="button" class="budget-amount-btn" data-action="open-budget-category-amount" data-category-id="' + escapeAttr(item.category.id) + '" data-category-name="' + escapeAttr(item.category.name) + '" data-month="' + escapeAttr(targetMonth) + '" data-amount="' + Math.round(item.limit || 0) + '" aria-label="Ubah batas ' + escapeAttr(item.category.name) + '">' +
          '<span class="budget-amount-value">' + money(item.limit || 0) + '</span>' +
          icon('edit', 'w-3 h-3') +
        '</button>' +
      '</div>' +
      (item.limit ? progressBar(item.percent, rowTone, 'progress-thin') + (item.remaining < 0 ? '<p class="budget-cat-over">Lebih ' + money(Math.abs(item.remaining)) + '</p>' : '') : '') +
    '</div>';
  }).join('') || '<p class="text-sm text-slate-500">Belum ada kategori pengeluaran.</p>';

  return '<div class="p-5 sm:p-6">' +
    '<div class="flex items-center justify-between gap-3 mb-4">' +
      '<div>' +
        '<p class="card-kicker">Anggaran</p>' +
        '<h2 class="section-title">Edit anggaran</h2>' +
      '</div>' +
      '<button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">' + icon('x') + '</button>' +
    '</div>' +
    '<form data-form="budget-thresholds" class="space-y-4">' +
      '<div>' +
        '<p class="card-kicker">Total anggaran</p>' +
        '<p class="text-2xl font-bold text-slate-900 dark:text-white mt-1">' + money(status.total) + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-1">Dihitung otomatis dari jumlah batas kategori. Ubah per kategori dengan menekan nominalnya.</p>' +
      '</div>' +

      '<div class="pt-4 border-t border-slate-200 dark:border-slate-700">' +
        '<p class="card-kicker">Batas per kategori</p>' +
        '<h3 class="section-title mb-2">Kendali pengeluaran</h3>' +
        '<div class="budget-category-list">' + rowHtml + '</div>' +
        '<div class="flex flex-wrap gap-2 mt-3">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="copy-budget" title="Salin anggaran bulan sebelumnya">' + icon('copy', 'w-3.5 h-3.5') + ' Salin bulan lalu</button>' +
        '</div>' +
        '<p class="text-[11px] text-slate-400">Salin: menyalin nominal anggaran dari bulan lalu.</p>' +
      '</div>' +

      '<div class="pt-4 border-t border-slate-200 dark:border-slate-700">' +
        '<p class="card-kicker">Warna peringatan</p>' +
        '<h3 class="section-title mb-2">Ambang batas</h3>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<label class="field-label">Peringatan (%)' +
            '<input class="field mt-1.5" type="number" name="warning" min="1" max="99" value="' + status.warning + '">' +
          '</label>' +
          '<label class="field-label">Bahaya (%)' +
            '<input class="field mt-1.5" type="number" name="danger" min="2" max="100" value="' + status.danger + '">' +
          '</label>' +
        '</div>' +
        '<div class="threshold-preview mt-3">' +
          '<span class="bg-emerald-500">Aman</span>' +
          '<span class="bg-amber-500">Peringatan &gt;= ' + status.warning + '%</span>' +
          '<span class="bg-red-500">Bahaya &gt;= ' + status.danger + '%</span>' +
        '</div>' +
      '</div>' +

      '<div class="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">' +
        '<button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>' +
        '<button type="submit" class="btn btn-primary">' + icon('save', 'w-4 h-4') + ' Simpan</button>' +
      '</div>' +
    '</form>' +
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