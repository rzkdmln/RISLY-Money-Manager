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
  const summary = store.monthSummary(month);
  const budget = store.budgetStatus(month);
  const netWorth = store.totalBalance();
  const accounts = store.activeAccounts();
  const recent = store.transactions().slice(0, 6);
  const spending = store.expenseByCategory(month);
  const spendingTotal = spending.reduce((total, item) => total + item.total, 0);
  const upcoming = store.upcomingRecurring(3, 30);
  const tasks = store.tasksDue(7).slice(0, 4);
  const dueRecurring = store.dueRecurring().length;
  const dueTasks = store.tasksDue(0).length;
  const budgetTone = toneForPercent(budget.percent, budget.warning, budget.danger);

  const accountMini = accounts.slice(0, 3).map((account) => `<button type="button" class="networth-account min-w-0 max-w-full" data-action="edit-account" data-id="${escapeAttr(account.id)}">
    <span class="networth-account-icon shrink-0">${icon(accountIcon(account), 'w-3.5 h-3.5')}</span>
    <span class="truncate">${escapeHTML(account.name)}</span>
    <strong class="shrink-0">${money(store.accountBalance(account.id), { compact: Math.abs(store.accountBalance(account.id)) >= 1_000_000 })}</strong>
  </button>`).join('');

  const topCategories = spending.slice(0, 5).map((item) => {
    const percent = spendingTotal > 0 ? (item.total / spendingTotal) * 100 : 0;
    return `<button type="button" class="legend-row min-w-0 w-full" data-action="nav" data-route="reports">
      <span class="legend-dot" style="--legend-color:${escapeAttr(item.color)}"></span>
      <span class="legend-name truncate">${escapeHTML(item.name)}</span>
      <span class="legend-value shrink-0">${money(item.total, { compact: item.total >= 10_000_000 })}</span>
      <span class="legend-percent shrink-0">${formatPercent(percent)}</span>
    </button>`;
  }).join('');

  const categoryBudgetMini = budget.categories
    .filter((item) => item.limit > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3)
    .map((item) => {
      const tone = toneForPercent(item.percent, budget.warning, budget.danger);
      return `<div class="budget-mini-row min-w-0 w-full">
        <div class="flex items-center justify-between gap-2 text-[11px] min-w-0">
          <span class="truncate text-slate-600 dark:text-slate-300">${escapeHTML(item.category.name)}</span>
          <span class="font-semibold text-slate-700 dark:text-slate-200 shrink-0">${formatPercent(item.percent)}</span>
        </div>
        ${progressBar(item.percent, tone, 'progress-thin')}
      </div>`;
    }).join('');

  const quickActions = [
    { type: 'expense', label: 'Pengeluaran', icon: 'arrow-up-right', tone: 'expense' },
    { type: 'income', label: 'Pemasukan', icon: 'arrow-down-left', tone: 'income' },
    { type: 'transfer', label: 'Transfer', icon: 'arrow-left-right', tone: 'transfer' },
    { type: 'note', label: 'Catatan', icon: 'sticky-note', tone: 'note' },
  ].map((item) => `<button type="button" class="quick-tile quick-${item.tone} min-w-0 w-full justify-start truncate" data-action="${item.type === 'note' ? 'add-note' : 'add-tx'}" ${item.type !== 'note' ? `data-type="${item.type}"` : ''}>
    <span class="quick-icon shrink-0">${icon(item.icon, 'w-5 h-5')}</span>
    <span class="truncate">${item.label}</span>
  </button>`).join('');

  const upcomingHtml = upcoming.length
    ? upcoming.map((rule) => {
      const category = store.categoryById(rule.categoryId);
      return `<button type="button" class="mini-list-row min-w-0 w-full" data-action="edit-rec" data-id="${escapeAttr(rule.id)}">
        <span class="mini-list-icon shrink-0" style="--mini-color:${escapeAttr(category?.color || '#3B82F6')}">${icon(rule.type === 'transfer' ? 'repeat' : category?.icon || 'receipt', 'w-3.5 h-3.5')}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">${escapeHTML(rule.title)}</span>
          <span class="block text-[10px] text-slate-500 dark:text-slate-400 truncate">${escapeHTML(relativeDay(rule.nextDate))} · ${escapeHTML(formatDate(rule.nextDate))}</span>
        </span>
        <span class="text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">${money(rule.amount, { compact: rule.amount >= 1_000_000 })}</span>
      </button>`;
    }).join('')
    : `<p class="mini-empty">Belum ada tagihan berulang. <button type="button" class="link-button" data-action="add-rec">Buat jadwal</button></p>`;

  const tasksHtml = tasks.length
    ? tasks.map((task) => `<button type="button" class="mini-list-row min-w-0 w-full" data-action="edit-note" data-id="${escapeAttr(task.id)}">
        <span class="mini-check shrink-0 ${task.done ? 'is-done' : ''}">${task.done ? icon('check', 'w-2.5 h-2.5') : ''}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">${escapeHTML(task.title)}</span>
          <span class="block text-[10px] truncate ${task.dueDate < todayISO() ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}">${escapeHTML(relativeDay(task.dueDate))}</span>
        </span>
        <span class="shrink-0">${badge(task.priority === 'urgent' ? 'Mendesak' : task.priority === 'high' ? 'Tinggi' : 'Tugas', task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'amber' : 'blue', 'badge-soft')}</span>
      </button>`).join('')
    : `<p class="mini-empty">Tidak ada tugas yang mendekati tenggat. <button type="button" class="link-button" data-action="add-todo">Tambah tugas</button></p>`;

  return `<div class="page-stack min-w-0 w-full overflow-hidden">
    ${pageHeader({
      eyebrow: `Ringkasan ${escapeHTML(formatMonth(month))}`,
      title: `${escapeHTML(greeting())}, ${escapeHTML(user?.name || '')} <span class="wave">👋</span>`,
      subtitle: 'Pencatatan keuangan keluarga dalam satu tempat.',
      actions: `<button type="button" class="btn btn-primary hidden sm:inline-flex" data-action="add-tx" data-type="expense">${icon('plus', 'w-4 h-4')} Transaksi</button>`,
    })}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0 w-full">
      <section class="networth-card lg:col-span-2 min-w-0 w-full overflow-hidden">
        <div class="networth-glow"></div>
        <div class="relative z-10 min-w-0">
          <div class="flex items-start justify-between gap-4 min-w-0">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="networth-label">Kekayaan bersih</p>
                <button type="button" class="networth-eye shrink-0" data-action="toggle-privacy" aria-label="${prefs.hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal'}">${icon(prefs.hideAmounts ? 'eye-off' : 'eye', 'w-4 h-4')}</button>
              </div>
              <p class="networth-value truncate">${money(netWorth)}</p>
            </div>
            <span class="networth-pill shrink-0">${icon('wallet', 'w-3.5 h-3.5')} ${accounts.length} akun aktif</span>
          </div>

          <div class="networth-flow min-w-0">
            <div class="min-w-0">
              <span class="networth-flow-label">Masuk bulan ini</span>
              <span class="networth-flow-value income truncate">+${money(summary.income)}</span>
            </div>
            <span class="networth-divider shrink-0"></span>
            <div class="min-w-0">
              <span class="networth-flow-label">Keluar bulan ini</span>
              <span class="networth-flow-value expense truncate">-${money(summary.expense)}</span>
            </div>
            <span class="networth-divider hidden sm:block shrink-0"></span>
            <div class="hidden sm:block min-w-0">
              <span class="networth-flow-label">Arus kas</span>
              <span class="networth-flow-value truncate ${summary.net >= 0 ? 'income' : 'expense'}">${summary.net >= 0 ? '+' : ''}${money(summary.net)}</span>
            </div>
          </div>

          <div class="networth-accounts min-w-0">
            ${accountMini || '<span class="text-xs text-white/60">Belum ada akun. Tambahkan akun pertama.</span>'}
            <button type="button" class="networth-more shrink-0" data-action="nav" data-route="accounts">${icon('chevron-right', 'w-4 h-4')}</button>
          </div>

          <div class="networth-actions min-w-0">
            <button type="button" data-action="add-tx" data-type="transfer">${icon('arrow-left-right', 'w-3.5 h-3.5')} Transfer</button>
            <button type="button" data-action="add-tx" data-type="income">${icon('plus', 'w-3.5 h-3.5')} Catat pemasukan</button>
          </div>
        </div>
      </section>

      <section class="card budget-card min-w-0 w-full overflow-hidden">
        <div class="flex items-start justify-between gap-3 min-w-0">
          <div class="min-w-0">
            <p class="card-kicker">Anggaran bulan ini</p>
            <h2 class="text-lg font-bold text-slate-900 dark:text-white mt-0.5 truncate">${budget.total > 0 ? formatPercent(budget.percent) : 'Belum diatur'}</h2>
          </div>
          <button type="button" class="icon-btn shrink-0" data-action="nav" data-route="budgets" aria-label="Kelola anggaran">${icon('edit', 'w-4 h-4')}</button>
        </div>
        ${budget.total > 0 ? `
          <div class="mt-4 min-w-0">
            ${progressBar(budget.percent, budgetTone, 'progress-lg')}
            <div class="budget-scale">
              <span>0</span>
              <span class="${budget.percent >= budget.warning ? 'text-amber-500' : ''}">${budget.warning}%</span>
              <span class="${budget.percent >= budget.danger ? 'text-red-500' : ''}">${budget.danger}%</span>
              <span>100%</span>
            </div>
          </div>
          <div class="flex items-end justify-between mt-4 gap-3 min-w-0">
            <div class="min-w-0">
              <p class="text-xs text-slate-500 dark:text-slate-400">Terpakai</p>
              <p class="text-base font-bold text-slate-900 dark:text-white truncate">${money(budget.spent)}</p>
            </div>
            <div class="text-right min-w-0">
              <p class="text-xs text-slate-500 dark:text-slate-400">${budget.remaining < 0 ? 'Kelebihan' : 'Tersisa'}</p>
              <p class="text-base font-bold truncate ${budget.remaining < 0 ? 'amount-expense' : 'text-slate-900 dark:text-white'}">${money(Math.abs(budget.remaining))}</p>
            </div>
          </div>
          ${budget.remaining < 0 ? `<p class="budget-alert mt-3 min-w-0">${icon('alert-triangle', 'w-3.5 h-3.5')} Pengeluaran sudah melewati anggaran.</p>` : budget.percent >= budget.warning ? `<p class="budget-alert budget-alert-warning mt-3 min-w-0">${icon('info', 'w-3.5 h-3.5')} Hampir mencapai batas anggaran.</p>` : ''}
          <div class="budget-mini-list mt-4 min-w-0">${categoryBudgetMini}</div>
        ` : `<div class="budget-empty mt-5 min-w-0">
          <span class="empty-icon shrink-0">${icon('chart-pie', 'w-5 h-5')}</span>
          <p>Tentukan batas pengeluaran keluarga agar progresnya bisa dipantau.</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="nav" data-route="budgets">${icon('plus', 'w-3.5 h-3.5')} Atur anggaran</button>
        </div>`}
        <button type="button" class="budget-footer-link" data-action="nav" data-route="budgets">Detail anggaran ${icon('arrow-right', 'w-3.5 h-3.5')}</button>
      </section>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0 w-full">
      <section class="card chart-card min-w-0 w-full overflow-hidden">
        <div class="card-heading min-w-0">
          <div class="min-w-0">
            <p class="card-kicker">Komposisi pengeluaran</p>
            <h2 class="section-title truncate">Ke mana uang pergi?</h2>
          </div>
          <span class="period-chip shrink-0">${escapeHTML(formatMonth(month, { month: 'short' }))}</span>
        </div>
        <div class="donut-layout min-w-0">
          <div class="chart-box chart-box-donut min-w-0"><canvas id="expense-donut" aria-label="Diagram donat pengeluaran per kategori"></canvas></div>
          <div class="donut-legend min-w-0 w-full">${topCategories || `<p class="text-xs text-slate-500 dark:text-slate-400">Belum ada pengeluaran bulan ini.</p>`}</div>
        </div>
      </section>

      <section class="card chart-card min-w-0 w-full overflow-hidden">
        <div class="card-heading min-w-0">
          <div class="min-w-0">
            <p class="card-kicker">Tren 6 bulan</p>
            <h2 class="section-title truncate">Arus kas keluarga</h2>
          </div>
          <button type="button" class="icon-btn shrink-0" data-action="nav" data-route="reports" aria-label="Buka laporan">${icon('chart-pie', 'w-4 h-4')}</button>
        </div>
        <div class="chart-box chart-box-bars min-w-0"><canvas id="cashflow-bars" aria-label="Diagram batang arus kas enam bulan"></canvas></div>
      </section>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 min-w-0 w-full">
      <section class="card xl:col-span-2 min-w-0 w-full overflow-hidden">
        ${sectionHeading('Transaksi terbaru', `<button type="button" class="link-button shrink-0" data-action="nav" data-route="transactions">Lihat semua ${icon('arrow-right', 'w-3 h-3')}</button>`)}
        ${recent.length ? `<div class="tx-list min-w-0 w-full">${recent.map((tx) => txRow(tx, { compact: false })).join('')}</div>` : emptyState('receipt', 'Belum ada transaksi', 'Mulai catat pengeluaran atau pemasukan pertama kalian.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-tx" data-type="expense">${icon('plus', 'w-3.5 h-3.5')} Catat transaksi</button>`)}
        ${dueRecurring > 0 || dueTasks > 0 ? `<div class="attention-strip min-w-0">
          ${dueRecurring > 0 ? `<button type="button" data-action="nav" data-route="recurring">${icon('repeat', 'w-3.5 h-3.5')} ${dueRecurring} transaksi berulang jatuh tempo</button>` : ''}
          ${dueTasks > 0 ? `<button type="button" data-action="open-tasks">${icon('check-square', 'w-3.5 h-3.5')} ${dueTasks} tugas perlu perhatian</button>` : ''}
        </div>` : ''}
      </section>

      <div class="space-y-4 min-w-0 w-full">
        <section class="card min-w-0 w-full overflow-hidden">
          ${sectionHeading('Aksi cepat')}
          <div class="quick-grid min-w-0 w-full">${quickActions}</div>
        </section>
        <section class="card min-w-0 w-full overflow-hidden">
          ${sectionHeading('Jadwal mendatang', `<button type="button" class="link-button shrink-0" data-action="nav" data-route="recurring">Semua</button>`)}
          <div class="mini-list min-w-0 w-full">${upcomingHtml}</div>
        </section>
        <section class="card min-w-0 w-full overflow-hidden">
          ${sectionHeading('Tugas terdekat', `<button type="button" class="link-button shrink-0" data-action="nav" data-route="notes">Buka</button>`)}
          <div class="mini-list min-w-0 w-full">${tasksHtml}</div>
        </section>
      </div>
    </div>
  </div>`;
}
