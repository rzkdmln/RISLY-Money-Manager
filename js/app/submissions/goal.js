/**
 * RISLY — Goal Submissions.
 * Domain: goals
 */

import { showFormError } from '../../ui/ui.js';
import { stringValue } from '../../core/utils.js';
import { store } from '../../core/store.js';
import { ui, closeModal, toast } from '../../ui/ui.js';
import { renderApplication } from '../runtime.js';

export const goalSubmissions = {
  goal: (form) => {
    const fd = new FormData(form);
    const editingId = form.dataset.id || null;
    const name = String(fd.get('name') || '').trim();
    if (!name) {
      showFormError(form, 'Nama target wajib diisi.');
      return;
    }
    const targetAmount = Number(fd.get('targetAmount')) || 0;
    const currentAmount = Number(fd.get('currentAmount')) || 0;
    const dueDate = String(fd.get('dueDate') || '').trim() || null;
    try {
      store.saveGoal({ name, targetAmount, currentAmount, dueDate }, editingId);
      closeModal({ silent: true });
      toast('Target disimpan.', 'success');
      renderApplication();
    } catch (error) {
      showFormError(form, error.message || 'Gagal menyimpan target.');
    }
  },
};
