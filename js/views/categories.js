import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, money, pageHeader, ui } from '../ui.js';
import { escapeAttr, escapeHTML } from '../utils.js';

export function categoriesView() {
  if (!['expense', 'income'].includes(ui.categoryTab)) ui.categoryTab = 'expense';
  const type = ui.categoryTab;
  const categories = store.categories(type);
  const allTx = store.transactions();
  const totalTx = allTx.filter((tx) => tx.type === type).length;
  const usedCategories = new Set(allTx.filter((tx) => tx.type === type).map((tx) => tx.categoryId));

  const cards = categories.map((category) => {
    const txCount = allTx.filter((tx) => tx.categoryId === category.id).length;
    const spent = allTx.filter((tx) => tx.categoryId === category.id && tx.type === 'expense').reduce((total, tx) => total + tx.amount, 0);
    const earned = allTx.filter((tx) => tx.categoryId === category.id && tx.type === 'income').reduce((total, tx) => total + tx.amount, 0);
    const subs = (category.subcategories || []).filter((sub) => !sub.deletedAt);
    return `<article class="category-card" style="--category-color:${escapeAttr(category.color)}">
      <div class="category-card-head">
        <span class="category-icon">${icon(category.icon, 'w-5 h-5')}</span>
        <div class="min-w-0 flex-1">
          <h3 class="category-name">${escapeHTML(category.name)}</h3>
          <p class="category-meta">${txCount} transaksi · ${subs.length} subkategori</p>
        </div>
        <button type="button" class="card-icon-btn" data-action="edit-category" data-id="${escapeAttr(category.id)}" aria-label="Ubah kategori">${icon('edit', 'w-3.5 h-3.5')}</button>
        <button type="button" class="card-icon-btn danger" data-action="delete-category" data-id="${escapeAttr(category.id)}" aria-label="Hapus kategori">${icon('trash', 'w-3.5 h-3.5')}</button>
      </div>
      <div class="category-total">
        <span>${type === 'expense' ? 'Total pengeluaran' : 'Total pemasukan'}</span>
        <strong class="${type === 'expense' ? 'amount-expense' : 'amount-income'}">${money(type === 'expense' ? spent : earned)}</strong>
      </div>
      <div class="subcategory-list">
        ${subs.map((sub) => `<span class="subcategory-chip">${escapeHTML(sub.name)}<button type="button" data-action="delete-sub" data-category="${escapeAttr(category.id)}" data-sub="${escapeAttr(sub.id)}" aria-label="Hapus subkategori ${escapeAttr(sub.name)}">${icon('x', 'w-2.5 h-2.5')}</button></span>`).join('')}
        <button type="button" class="subcategory-add" data-action="add-sub" data-id="${escapeAttr(category.id)}">${icon('plus', 'w-3 h-3')} Subkategori</button>
      </div>
      ${usedCategories.has(category.id) ? `<p class="category-note">${icon('info', 'w-3 h-3')} Kategori tetap tersimpan di riwayat meski dihapus.</p>` : ''}
    </article>`;
  }).join('');

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Struktur keuangan',
      title: 'Kategori',
      subtitle: 'Kelompokkan transaksi dengan kategori utama dan subkategori.',
      actions: `<button type="button" class="btn btn-primary" data-action="add-category" data-type="${type}">${icon('plus', 'w-4 h-4')} Kategori</button>`,
    })}

    <div class="category-summary">
      <div>
        <p class="card-kicker">Kategori ${type === 'expense' ? 'pengeluaran' : 'pemasukan'}</p>
        <p class="text-2xl font-bold text-slate-900 dark:text-white">${categories.length} kategori</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${totalTx} transaksi memakai kelompok ini</p>
      </div>
      <div class="segmented-control">
        <button type="button" class="${type === 'expense' ? 'is-active' : ''}" data-action="category-tab" data-type="expense">${icon('arrow-up-right', 'w-3.5 h-3.5')} Pengeluaran</button>
        <button type="button" class="${type === 'income' ? 'is-active' : ''}" data-action="category-tab" data-type="income">${icon('arrow-down-left', 'w-3.5 h-3.5')} Pemasukan</button>
      </div>
    </div>

    ${categories.length ? `<div class="categories-grid">${cards}</div>` : emptyState('tag', `Belum ada kategori ${type === 'expense' ? 'pengeluaran' : 'pemasukan'}`, 'Tambahkan kategori agar laporan lebih mudah dibaca.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-category" data-type="${type}">${icon('plus', 'w-3.5 h-3.5')} Tambah kategori</button>`)}

    <div class="grid md:grid-cols-2 gap-4">
      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Tips struktur</p>
            <h2 class="section-title">Kategori yang mudah dibaca</h2>
          </div>
          ${icon('sparkles', 'w-5 h-5 text-amber-500')}
        </div>
        <ul class="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
          <li class="flex gap-2.5">${icon('check', 'w-4 h-4 text-emerald-500 shrink-0')} Gunakan 6–10 kategori utama agar diagram tetap informatif.</li>
          <li class="flex gap-2.5">${icon('check', 'w-4 h-4 text-emerald-500 shrink-0')} Subkategori cocok untuk kebutuhan yang sering berulang.</li>
          <li class="flex gap-2.5">${icon('check', 'w-4 h-4 text-emerald-500 shrink-0')} Kategori yang dihapus tidak akan menghilangkan transaksi lama.</li>
        </ul>
      </section>
      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Ringkasan</p>
            <h2 class="section-title">Pemakaian</h2>
          </div>
          ${badge(`${usedCategories.size} dipakai`, 'blue', 'badge-soft')}
        </div>
        <div class="categories-usage">
          ${categories.slice(0, 5).map((cat) => {
            const count = allTx.filter((tx) => tx.categoryId === cat.id).length;
            return `<div class="flex items-center gap-2 text-xs"><span class="legend-dot" style="--legend-color:${escapeAttr(cat.color)}"></span><span class="flex-1 text-slate-600 dark:text-slate-300 truncate">${escapeHTML(cat.name)}</span><strong class="text-slate-800 dark:text-slate-100">${count}</strong></div>`;
          }).join('') || '<p class="text-sm text-slate-500">Belum ada pemakaian.</p>'}
        </div>
      </section>
    </div>
  </div>`;
}
