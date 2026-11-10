/**
 * RISLY — Category Actions.
 * Domain: categories
 */

import { openCategoryModal } from '../modals.js';
import { openModal } from '../../ui.js';
import { store } from '../../store.js';
import {
  ui,
  closeModal,
  confirmDialog,
  toast,
} from '../../ui.js';
import { renderApplication } from '../runtime.js';
import { subcategoryForm } from '../../forms/account.js';

export const categoryActions = {
  'add-category': (element) => {
    closeModal({ silent: true });
    openCategoryModal(
      null,
      element.dataset.type || ui.categoryTab,
    );
  },
  'edit-category': (element) => {
    const id = element.dataset.id;
    const category = store.categoryById(id);
    if (!category) return;
    closeModal({ silent: true });
    openCategoryModal(category);
  },
  'delete-category': async (element) => {
    const id = element.dataset.id;
    const category = store.categoryById(id);
    if (!category) return;
    const ok = await confirmDialog({
      title: 'Hapus kategori?',
      message: `Kategori "${category.name}" akan disembunyikan dari pilihan baru. Transaksi lama tetap menyimpan nama kategori ini.`,
    });
    if (!ok) return;
    store.deleteCategory(id);
    toast('Kategori dihapus.', 'success');
    renderApplication();
  },
  'add-sub': (element) => {
    const id = element.dataset.id;
    const category = store.categoryById(id);
    if (!category) return;
    closeModal({ silent: true });
    openModal({
      size: 'md',
      className: 'form-modal',
      html: subcategoryForm(category),
    });
  },
  'delete-sub': async (element) => {
    const categoryId = element.dataset.category;
    const subId = element.dataset.sub;
    const sub = store.subcategoryById(categoryId, subId);
    if (!sub) return;
    const ok = await confirmDialog({
      title: 'Hapus subkategori?',
      message: `"${sub.name}" tidak akan muncul lagi pada transaksi baru.`,
    });
    if (!ok) return;
    store.deleteSubcategory(categoryId, subId);
    toast('Subkategori dihapus.', 'success');
    renderApplication();
  },
  'add-subcategory': (element) => {
    const categoryId = element.dataset.category;
    const category = store.categoryById(categoryId);
    if (!category) return;
    const input =
      document.querySelector(
        `[data-subcategory-manager="${CSS.escape(categoryId)}"] [data-subcategory-name]`,
      ) ||
      element
        .closest('.subcategory-manager')
        ?.querySelector('[data-subcategory-name]');
    const name = String(input?.value || '').trim();
    if (!name) {
      toast('Nama subkategori wajib diisi.', 'error');
      return;
    }
    store.addSubcategory(categoryId, name);
    if (input) input.value = '';
    toast('Subkategori ditambahkan.', 'success');
    const updated = store.categoryById(categoryId);
    closeModal({ silent: true });
    openCategoryModal(updated);
  },
  'rename-subcategory': (element) => {
    const categoryId = element.dataset.category;
    const subId = element.dataset.subcategory;
    const sub = store.subcategoryById(categoryId, subId);
    if (!sub) return;
    const name = window.prompt('Nama subkategori baru', sub.name);
    if (name === null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      toast('Nama subkategori tidak boleh kosong.', 'error');
      return;
    }
    store.renameSubcategory(categoryId, subId, trimmed);
    toast('Subkategori diperbarui.', 'success');
    const updated = store.categoryById(categoryId);
    closeModal({ silent: true });
    openCategoryModal(updated);
  },
  'delete-subcategory': async (element) => {
    const categoryId = element.dataset.category;
    const subId = element.dataset.subcategory;
    const sub = store.subcategoryById(categoryId, subId);
    if (!sub) return;
    const ok = await confirmDialog({
      title: 'Hapus subkategori?',
      message: `"${sub.name}" tidak akan muncul lagi pada transaksi baru.`,
    });
    if (!ok) return;
    store.deleteSubcategory(categoryId, subId);
    toast('Subkategori dihapus.', 'success');
    const updated = store.categoryById(categoryId);
    closeModal({ silent: true });
    openCategoryModal(updated);
  },
  'category-tab': (element) => {
    ui.categoryTab = element.dataset.type === 'income' ? 'income' : 'expense';
    renderApplication();
  },
};
