/**
 * RISLY — Category Submissions.
 * Domain: categories
 */

import { showFormError } from '../../ui/ui.js';
import { stringValue } from '../../core/utils.js';
import { store } from '../../core/store.js';
import { ui, closeModal, toast } from '../../ui/ui.js';
import { renderApplication } from '../runtime.js';

export const categorySubmissions = {
  category: (form) => {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) {
      showFormError(form, 'Nama kategori wajib diisi.');
      return;
    }
    try {
      store.saveCategory(
        {
          name,
          type: String(fd.get('type') || 'expense'),
          icon: String(fd.get('icon') || 'tag'),
          color: String(fd.get('color') || '#64748B'),
        },
        form.dataset.id || null,
      );
      closeModal({ silent: true });
      toast('Kategori disimpan.', 'success');
      renderApplication();
    } catch (error) {
      showFormError(form, error.message || 'Gagal menyimpan kategori.');
    }
  },
  subcategory: (form) => {
    const name = stringValue(form, 'name');
    const categoryId = form.dataset.category;
    if (!name) {
      showFormError(form, 'Nama subkategori wajib diisi.');
      return;
    }
    try {
      store.addSubcategory(categoryId, name);
      closeModal({ silent: true });
      toast('Subkategori ditambahkan.', 'success');
      renderApplication();
    } catch (error) {
      showFormError(form, error.message || 'Gagal menambah subkategori.');
    }
  },
};
