/**
 * RISLY — Workspace Submissions.
 * Domain: workspace
 */

import {
  showFormError,
  stringValue,
  enterApplication,
} from '../../app.js';
import { store } from '../../store.js';
import { signInWithGoogleFlow } from '../../app.js';
import { ui, toast, closeModal } from '../../ui.js';

export const workspaceSubmissions = {
  'join-workspace': async (form) => {
    const code = stringValue(form, 'inviteCode').toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      showFormError(form, 'Kode undangan tidak valid.');
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const account = await signInWithGoogleFlow();
      const result = await store.joinWorkspaceByCode(code, account);
      closeModal({ silent: true });
      toast(
        result?.localOnly
          ? 'Bergabung ke ruang lokal. Cloud keluarga belum bisa dijangkau.'
          : 'Bergabung ke ruang keluarga. Data akan disinkronkan.',
        result?.localOnly ? 'info' : 'success',
      );
      enterApplication(result.user);
    } catch (error) {
      console.error(error);
      showFormError(form, error.message || 'Gagal bergabung ke ruang.');
    } finally {
      if (submit) submit.disabled = false;
    }
  },
};
