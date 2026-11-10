import { Cloud } from '../cloud.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import {
  badge,
  emptyState,
  money,
  pageHeader,
  prefs,
  progressBar,
  sectionHeading,
  toneForPercent,
  ui,
} from '../ui.js';
import {
  escapeAttr,
  escapeHTML,
  formatDate,
  formatMonth,
  formatPercent,
  greeting,
  monthKey,
  relativeDay,
  todayISO,
} from '../utils.js';
import { accountIcon, txRow } from './common.js';

export function dashboardView(user) {
  const month = monthKey();
  const netWorth = store.totalBalance();
  const myNetWorth = store.personalBalance();

  if (!ui.networthFilter) ui.networthFilter = prefs.networthFilter || 'all';
  const personalScope = ui.networthFilter === 'mine';
  const personalAccountIds = new Set(store.accountsByOwner().map((account) => account.id));
  const cloudStatus = Cloud.getStatus();
  const isPersonalTx = (tx) => personalAccountIds.has(tx.accountId)
    || personalAccountIds.has(tx.toAccountId)
    || (Array.isArray(tx.payments) && tx.payments.some((payment) => personalAccountIds.has(payment.accountId)));
  const scopedTransactions = personalScope
    ? store.transactionsForMonth(month).filter(isPersonalTx)
    : store.transactionsForMonth(month);
  const scopedSummary = personalScope
    ? store.summaryForTransactions(scopedTransactions, { accountIds: personalAccountIds })
    : store.summaryForTransactions(scopedTransactions);

  const income = scopedSummary.income || 0;
  const expense = scopedSummary.expense || 0;
  const cashflow = income - expense;

  // Anggaran adalah milik keluarga (shared), tidak mengikuti scope pribadi.
  const budget = store.budgetStatus(month);
  const cashflowPrefix = cashflow > 0 ? '+' : '';
  const cashflowColor = cashflow >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400';

  const recentSource = personalScope
    ? store.transactions().filter(isPersonalTx)
    : store.transactions();
  const recent = recentSource.slice(0, 5);
  const spendingMap = new Map();
  scopedTransactions
    .filter((tx) => tx.type === 'expense')
    .forEach((tx) => {
      const cat = store.categoryById(tx.categoryId);
      const key = tx.categoryId || 'uncategorized';
      if (!spendingMap.has(key)) {
        spendingMap.set(key, {
          categoryId: key,
          name: cat?.name || 'Tanpa kategori',
          color: cat?.color || 'var(--muted-2)',
          icon: cat?.icon || 'tag',
          total: 0,
        });
      }
      spendingMap.get(key).total += (Number(tx.amount) || 0);
    });
  const spending = [...spendingMap.values()].sort((a, b) => b.total - a.total);
  const spendingTotal = spending.reduce((total, item) => total + item.total, 0);
  const upcoming = store.upcomingRecurring(3, 30).filter((rule) => !personalScope || personalAccountIds.has(rule.accountId));
  const tasks = store.tasksDue(7).slice(0, 4);
  const dueRecurring = store.dueRecurring().length;
  const dueTasks = store.tasksDue(0).length;
  const budgetTone = toneForPercent(budget.percent, budget.warning, budget.danger);

  const topCategories = spending.slice(0, 5).map((item) => {
    const percent = spendingTotal > 0 ? (item.total / spendingTotal) * 100 : 0;
    return `<button type="button" class="legend-row min-w-0 w-full hover:bg-slate-50 dark:hover:bg-slate-800/50 p-1.5 rounded-lg transition-colors" data-action="nav" data-route="reports">
      <span class="legend-dot" style="--legend-color:${escapeAttr(item.color)}"></span>
      <span class="legend-name truncate">${escapeHTML(item.name)}</span>
      <span class="legend-value shrink-0 font-medium">${money(item.total, { compact: item.total >= 10_000_000 })}</span>
      <span class="legend-percent shrink-0 text-slate-400">${formatPercent(percent)}</span>
    </button>`;
  }).join('');

  const upcomingHtml = upcoming.length
    ? upcoming.map((rule) => {
      const category = store.categoryById(rule.categoryId);
      return `<button type="button" class="mini-list-row min-w-0 w-full p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors flex items-center gap-3" data-action="edit-rec" data-id="${escapeAttr(rule.id)}">
        <span class="mini-list-icon shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white" style="background-color:${escapeAttr(category?.color || 'var(--brand)')}">${icon(rule.type === 'transfer' ? 'repeat' : category?.icon || 'receipt', 'w-3.5 h-3.5')}</span>
        <span class="min-w-0 flex-1 text-left">
          <span class="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${escapeHTML(rule.title)}</span>
          <span class="block text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5">${escapeHTML(relativeDay(rule.nextDate))} · ${escapeHTML(formatDate(rule.nextDate))}</span>
        </span>
        <span class="text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">${money(rule.amount, { compact: rule.amount >= 1_000_000 })}</span>
      </button>`;
    }).join('')
    : `<p class="mini-empty text-center p-4">Belum ada tagihan berulang. <button type="button" class="link-button font-semibold" data-action="add-rec">Buat jadwal</button></p>`;

  const tasksHtml = tasks.length
    ? tasks.map((task) => `<button type="button" class="mini-list-row min-w-0 w-full p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors flex items-center gap-3" data-action="edit-note" data-id="${escapeAttr(task.id)}">
        <span class="mini-check shrink-0 ${task.done ? 'is-done text-emerald-500' : 'text-slate-300'}">${task.done ? icon('check', 'w-4 h-4') : icon('circle', 'w-4 h-4')}</span>
        <span class="min-w-0 flex-1 text-left">
          <span class="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate ${task.done ? 'line-through text-slate-400' : ''}">${escapeHTML(task.title)}</span>
          <span class="block text-[12px] truncate mt-0.5 ${task.dueDate < todayISO() ? 'text-red-500 font-medium' : 'text-slate-500 dark:text-slate-400'}">${escapeHTML(relativeDay(task.dueDate))}</span>
        </span>
        <span class="shrink-0">${badge(task.priority === 'urgent' ? 'Mendesak' : task.priority === 'high' ? 'Tinggi' : 'Tugas', task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'amber' : 'slate', 'badge-soft')}</span>
      </button>`).join('')
    : `<p class="mini-empty text-center p-4">Tidak ada tugas yang mendekati tenggat. <button type="button" class="link-button font-semibold" data-action="add-todo">Tambah tugas</button></p>`;

  return `<div class="page-stack min-w-0 w-full overflow-hidden dashboard-view">
    ${pageHeader({
      eyebrow: `Ringkasan ${escapeHTML(formatMonth(month))}`,
      title: `${escapeHTML(greeting())}, ${escapeHTML(user?.name || '')} <span class="wave">👋</span>`,
      actions: `<div class="segmented-control shrink-0 hidden sm:flex" role="group" aria-label="Scope kekayaan">
        <button type="button" class="${!personalScope ? 'is-active' : ''}" data-action="set-networth-filter" data-scope="all">Keluarga</button>
        <button type="button" class="${personalScope ? 'is-active' : ''}" data-action="set-networth-filter" data-scope="mine">Saya</button>
      </div>`,
    })}

    ${!cloudStatus.connected && cloudStatus.provider !== 'local' ? `<div class="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">Sinkronisasi belum aktif</p>
        <p class="text-xs text-amber-700 dark:text-amber-300/80">Hubungkan Google Drive/database di Pengaturan agar data tersinkron.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm shrink-0" data-action="nav" data-route="settings">Hubungkan</button>
    </div>` : ''}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 min-w-0 w-full">
      <!-- KARTU KEKAYAAN (CLEAN & SWITCHABLE) -->
      <section class="accounts-hero min-w-0 w-full overflow-hidden relative rounded-2xl p-6 shadow-sm flex flex-col justify-between">
        <div class="accounts-hero-ring"></div>
        <div class="accounts-hero-ring accounts-hero-ring-two"></div>

        <!-- Scope switcher (mobile only) -->
        <div class="sm:hidden mb-4">
          <div class="segmented-control shrink-0" role="group" aria-label="Scope kekayaan">
            <button type="button" class="${!personalScope ? 'is-active' : ''}" data-action="set-networth-filter" data-scope="all">Keluarga</button>
            <button type="button" class="${personalScope ? 'is-active' : ''}" data-action="set-networth-filter" data-scope="mine">Saya</button>
          </div>
        </div>

        <!-- Header -->
        <div class="flex items-center justify-between min-w-0">
          <p class="text-xs font-semibold text-white">${personalScope ? 'Kekayaan Pribadi' : 'Total Kekayaan Keluarga'}</p>
          <button type="button" class="p-2 text-slate-400 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors shrink-0" data-action="toggle-privacy" aria-label="Sembunyikan nominal">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>
          </button>
        </div>

        <!-- Area Nominal Besar -->
        <div class="mb-4 min-w-0">
          <h2 class="text-4xl sm:text-5xl font-extrabold text-white truncate tracking-tight">${money(personalScope ? myNetWorth : netWorth)}</h2>
          <p class="mt-1 text-xs text-white">${personalScope ? 'Kekayaan Keluarga' : 'Kekayaan Pribadi'}: ${money(personalScope ? netWorth : myNetWorth)}</p>
        </div>

        <!-- Arus Kas -->
        <div class="pt-5 border-t border-white/10">
          <div class="grid grid-cols-2 gap-2 sm:gap-4 min-w-0">
            <div class="min-w-0">
              <span class="block text-[12px] font-bold uppercase tracking-wider text-white mb-1 truncate">Masuk</span>
              <span class="block text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 truncate">+${money(income)}</span>
            </div>
            <div class="min-w-0 border-l border-slate-100 dark:border-slate-800/60 pl-2 sm:pl-4">
              <span class="block text-[12px] font-bold uppercase tracking-wider text-white mb-1 truncate">Keluar</span>
              <span class="block text-sm sm:text-base font-bold text-rose-600 dark:text-rose-400 truncate">-${money(expense)}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- KARTU ANGGARAN -->
      <section class="card budget-card min-w-0 w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
        <div>
          <div class="flex items-start justify-between gap-3 min-w-0">
            <div class="min-w-0">
              <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Anggaran keluarga · ${escapeHTML(formatMonth(month))}</p>
              <h2 class="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 truncate">${budget.total > 0 ? formatPercent(budget.percent) : 'Belum diatur'}</h2>
            </div>
            <button type="button" class="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0" data-action="nav" data-route="budgets" aria-label="Kelola anggaran">${icon('edit', 'w-4 h-4')}</button>
          </div>

          ${budget.total > 0 ? `
            <div class="mt-5 min-w-0">
              ${progressBar(budget.percent, budgetTone, 'progress-lg')}
              <div class="flex justify-between text-[12px] font-medium text-slate-400 mt-1.5 px-1">
                <span>0</span>
                <span class="${budget.percent >= budget.warning ? 'text-amber-500 font-bold' : ''}">${budget.warning}%</span>
                <span class="${budget.percent >= budget.danger ? 'text-red-500 font-bold' : ''}">${budget.danger}%</span>
                <span>100%</span>
              </div>
            </div>
            <div class="flex items-end justify-between mt-5 gap-3 min-w-0 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
              <div class="min-w-0">
                <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Terpakai</p>
                <p class="text-sm font-bold text-slate-900 dark:text-white truncate">${money(budget.spent)}</p>
              </div>
              <div class="text-right min-w-0">
                <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">${budget.remaining < 0 ? 'Kelebihan' : 'Tersisa'}</p>
                <p class="text-sm font-bold truncate ${budget.remaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}">${money(Math.abs(budget.remaining))}</p>
              </div>
            </div>
            ${budget.remaining < 0 ? `<p class="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 mt-3 min-w-0">${icon('alert-triangle', 'w-3.5 h-3.5')} Pengeluaran melewati anggaran.</p>` : budget.percent >= budget.warning ? `<p class="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 mt-3 min-w-0">${icon('info', 'w-3.5 h-3.5')} Hampir mencapai batas.</p>` : ''}
          ` : `
            <div class="flex flex-col items-center justify-center mt-6 text-center min-w-0 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <span class="text-slate-300 dark:text-slate-600 mb-2">${icon('chart-pie', 'w-8 h-8')}</span>
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Tentukan batas pengeluaran keluarga agar progresnya terpantau.</p>
              <button type="button" class="btn btn-primary btn-sm rounded-lg" data-action="nav" data-route="budgets">${icon('plus', 'w-3.5 h-3.5')} Atur anggaran</button>
            </div>
          `}
        </div>
        <button type="button" class="flex items-center justify-center gap-1 w-full mt-4 py-2 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors" data-action="nav" data-route="budgets">Detail anggaran</button>
      </section>
    </div>

    <!-- CHARTS -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 min-w-0 w-full">
      <section class="card chart-card min-w-0 w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div class="flex items-start justify-between mb-4 min-w-0">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Komposisi pengeluaran</p>
            <h2 class="text-lg font-bold text-slate-900 dark:text-white truncate">Ke mana uang pergi?</h2>
          </div>
          <span class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold px-2.5 py-1 rounded-md shrink-0">${escapeHTML(formatMonth(month, { month: 'short' }))}</span>
        </div>
        <div class="flex flex-col sm:flex-row items-center gap-6 min-w-0 mt-4">
          <div class="chart-box chart-box-donut min-w-0 w-full sm:w-1/2 relative"><canvas id="expense-donut" aria-label="Diagram donat pengeluaran per kategori"></canvas></div>
          <div class="min-w-0 w-full sm:w-1/2 space-y-1">${topCategories || `<p class="text-xs text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">Belum ada pengeluaran bulan ini.</p>`}</div>
        </div>
      </section>

      <section class="card chart-card min-w-0 w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div class="flex items-start justify-between mb-4 min-w-0">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tren 6 bulan</p>
            <h2 class="section-title truncate">Arus kas keluarga</h2>
          </div>
          <button type="button" class="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0" data-action="nav" data-route="reports" aria-label="Buka laporan">${icon('chart-pie', 'w-4 h-4')}</button>
        </div>
        <div class="chart-box chart-box-bars min-w-0 mt-4"><canvas id="cashflow-bars" aria-label="Diagram batang arus kas enam bulan"></canvas></div>
      </section>
    </div>

    <!-- TRANSAKSI & SIDEBAR -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6 min-w-0 w-full">
      <section class="card xl:col-span-2 min-w-0 w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
           <h2 class="text-lg font-bold text-slate-900 dark:text-white">Transaksi terbaru</h2>
           <button type="button" class="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1" data-action="nav" data-route="transactions">Lihat semua</button>
        </div>
        ${recent.length ? `<div class="tx-list space-y-1 min-w-0 w-full">${recent.map((tx) => txRow(tx, { compact: false, showDate: true })).join('')}</div>` : emptyState('receipt', 'Belum ada transaksi', 'Catat pengeluaran atau pemasukan pertama.', `<button type="button" class="btn btn-primary btn-sm rounded-lg" data-action="add-tx" data-type="expense">${icon('plus', 'w-3.5 h-3.5')} Catat transaksi</button>`)}

        ${dueRecurring > 0 || dueTasks > 0 ? `<div class="mt-6 flex flex-col gap-2 min-w-0">
          ${dueRecurring > 0 ? `<button type="button" class="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-bold transition-colors hover:bg-amber-100" data-action="nav" data-route="recurring">${icon('repeat', 'w-4 h-4')} ${dueRecurring} transaksi berulang jatuh tempo</button>` : ''}
          ${dueTasks > 0 ? `<button type="button" class="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-bold transition-colors hover:bg-rose-100" data-action="open-tasks">${icon('check-square', 'w-4 h-4')} ${dueTasks} tugas perlu perhatian</button>` : ''}
        </div>` : ''}
      </section>

      <div class="space-y-4 lg:space-y-6 min-w-0 w-full">
        <section class="card min-w-0 w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between mb-4">
             <h2 class="text-sm font-bold text-slate-900 dark:text-white">Jadwal Mendatang</h2>
             <button type="button" class="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400" data-action="nav" data-route="recurring">Semua</button>
          </div>
          <div class="space-y-1 min-w-0 w-full">${upcomingHtml}</div>
        </section>

        <section class="card min-w-0 w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between mb-4">
             <h2 class="text-sm font-bold text-slate-900 dark:text-white">Tugas Terdekat</h2>
             <button type="button" class="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400" data-action="nav" data-route="notes">Buka</button>
          </div>
          <div class="space-y-1 min-w-0 w-full">${tasksHtml}</div>
        </section>
      </div>
    </div>
  </div>`;
}

