/**
 * RISLY — Profile Submissions.
 * Domain: profile
 */

import { showFormError } from '../../ui.js';
import { stringValue, formValue, getInitials } from '../../utils.js';
import { store } from '../../store.js';
import { ui, toast } from '../../ui.js';
import { renderApplication } from '../runtime.js';

export const profileSubmissions = {
  profile: (form) => {
    const user = store.getUser(form.dataset.user) || store.currentUser;
    if (!user) return;
    const name = stringValue(form, 'name');
    if (!name) {
      showFormError(form, 'Nama tampilan wajib diisi.');
      return;
    }
    try {
      store.updateUser(user.id, {
        name,
        initials: getInitials(name),
        color: String(formValue(form, 'color') || user.color || '#2563EB'),
      });
      closeModal({ silent: true });
      ui.currentUser = store.getUser(user.id);
      ui.appMounted = false;
      renderApplication();
      toast('Profil diperbarui.', 'success');
    } catch (error) {
      showFormError(form, error.message || 'Gagal memperbarui profil.');
    }
  },
};
