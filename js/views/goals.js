import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, money, pageHeader, progressBar } from '../ui.js';
import { escapeAttr, escapeHTML, formatDate } from '../utils.js';

export function goalsView() {
  const goals = store.goals();
  const totalTarget = goals.reduce((sum, goal) => sum + (goal.targetAmount || 0), 0);
  const totalSaved = goals.reduce((sum, goal) => sum + (goal.currentAmount || 0), 0);

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Rencana',
      title: 'Target keuangan',
      subtitle: 'Dana darurat, tabungan, dan tujuan keluarga.',
      actions: `<button type="button" class="btn btn-primary" data-action="add-goal">${icon('plus', 'w-4 h-4')} Target baru</button>`,
    })}

    <div class="grid grid-cols-2 gap-2.5 sm:gap-4">
      <div class="stat-card stat-green">
        <div class="stat-top"><span>Target</span><span class="stat-icon">${icon('piggy-bank', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(totalTarget, { compact: true })}</div>
        <div class="stat-hint">${goals.length} target aktif</div>
      </div>
      <div class="stat-card stat-blue">
        <div class="stat-top"><span>Terkumpul</span><span class="stat-icon">${icon('piggy-bank', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(totalSaved, { compact: true })}</div>
        <div class="stat-hint">${totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0}% dari target</div>
      </div>
    </div>

    ${goals.length ? `<div class="grid gap-3">${goals.map((goal) => {
      const percent = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
      return `<section class="card">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-semibold text-slate-900 dark:text-white truncate">${escapeHTML(goal.name)}</h3>
            ${goal.dueDate ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Target: ${escapeHTML(formatDate(goal.dueDate))}</p>` : ''}
          </div>
          <div class="flex gap-1 shrink-0">
            <button type="button" class="icon-btn" data-action="edit-goal" data-id="${escapeAttr(goal.id)}" aria-label="Ubah target">${icon('edit', 'w-4 h-4')}</button>
            <button type="button" class="icon-btn" data-action="delete-goal" data-id="${escapeAttr(goal.id)}" aria-label="Hapus target">${icon('trash-2', 'w-4 h-4')}</button>
          </div>
        </div>
        <div class="mt-3 flex items-end justify-between gap-3">
          <strong class="text-lg text-slate-900 dark:text-white">${money(goal.currentAmount)}</strong>
          <span class="text-xs text-slate-500 dark:text-slate-400">dari ${money(goal.targetAmount)}</span>
        </div>
        ${progressBar(percent, percent >= 100 ? 'green' : 'blue')}
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${Math.round(percent)}% tercapai</p>
      </section>`;
    }).join('')}</div>` : emptyState('target', 'Belum ada target', 'Tambah target keuangan untuk melacak progres tabungan.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-goal">${icon('plus', 'w-3.5 h-3.5')} Target baru</button>`)}
  </div>`;
}

export function goalForm(goal = null) {
  const editing = Boolean(goal?.id);
  return `<form data-form="goal" data-id="${escapeAttr(goal?.id || '')}" class="modal-form" novalidate>
    <header class="modal-header">
      <div>
        <p class="modal-kicker">${editing ? 'Perbarui target' : 'Target baru'}</p>
        <h2 class="modal-title">${editing ? 'Ubah target' : 'Target keuangan'}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <label class="field-label">Nama target
        <input class="field mt-1.5" name="name" maxlength="60" value="${escapeAttr(goal?.name || '')}" placeholder="Contoh: Dana darurat" required>
      </label>
      <div class="form-grid">
        <label class="field-label">Target (Rp)
          <input class="field mt-1.5" type="number" name="targetAmount" min="0" step="1000" inputmode="numeric" value="${Math.round(goal?.targetAmount || 0)}" required>
        </label>
        <label class="field-label">Terkumpul (Rp)
          <input class="field mt-1.5" type="number" name="currentAmount" min="0" step="1000" inputmode="numeric" value="${Math.round(goal?.currentAmount || 0)}">
        </label>
      </div>
      <label class="field-label">Tenggat (opsional)
        <input class="field mt-1.5" type="date" name="dueDate" value="${escapeAttr(goal?.dueDate || '')}">
      </label>
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      <span></span>
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} Simpan</button>
      </div>
    </footer>
  </form>`;
}