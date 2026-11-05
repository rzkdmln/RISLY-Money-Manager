import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, money, pageHeader, prefs, ui } from '../ui.js';
import { escapeAttr, escapeHTML } from '../utils.js';

export function categoriesView() {
  if (!['expense', 'income'].includes(ui.categoryTab)) ui.categoryTab = 'expense';
  const type = ui.categoryTab;
  const categories = store.categories(type);
  const allTx = store.transactions();
  const totalTx = allTx.filter((tx) => tx.type === type).length;
  const usedCategories = new Set(allTx.filter((tx) => tx.type === type).map((tx) => tx.categoryId));

  const view = prefs.categoriesView === 'list' ? 'list' : 'grid';
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
    </article>`;
  }).join('');

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Struktur keuangan',
      title: 'Kategori',
      actions: `<div class="flex items-center gap-2 flex-wrap justify-end">
        <div class="view-toggle shrink-0" role="group" aria-label="Tampilan kategori">
          <button type="button" class="${view === 'grid' ? 'is-active' : ''}" data-action="set-categories-view" data-view="grid" aria-label="Tampilan kartu">${icon('layout-grid', 'w-4 h-4')}</button>
          <button type="button" class="${view === 'list' ? 'is-active' : ''}" data-action="set-categories-view" data-view="list" aria-label="Tampilan daftar">${icon('layout-list', 'w-4 h-4')}</button>
        </div>
        <button type="button" class="btn btn-primary" data-action="add-category" data-type="${type}">${icon('plus', 'w-4 h-4')} Kategori</button>
      </div>`,
    })}

    <div class="category-summary">
      <div class="segmented-control">
        <button type="button" class="${type === 'expense' ? 'is-active' : ''}" data-action="category-tab" data-type="expense">${icon('arrow-up-right', 'w-3.5 h-3.5')} Pengeluaran</button>
        <button type="button" class="${type === 'income' ? 'is-active' : ''}" data-action="category-tab" data-type="income">${icon('arrow-down-left', 'w-3.5 h-3.5')} Pemasukan</button>
      </div>
    </div>

    ${categories.length ? `<div class="${view === 'list' ? 'categories-grid categories-list-view' : 'categories-grid'}">${cards}</div>` : emptyState('tag', `Belum ada kategori ${type === 'expense' ? 'pengeluaran' : 'pemasukan'}`, 'Tambahkan kategori agar laporan lebih mudah dibaca.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-category" data-type="${type}">${icon('plus', 'w-3.5 h-3.5')} Tambah kategori</button>`)}

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
  </div>`;
}

