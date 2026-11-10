/**
 * RISLY — Note Submissions.
 * Domain: notes
 */

import {
  showFormError,
  noteSaveTimer,
} from '../../app.js';
import { store } from '../../store.js';
import { collectNotePayload } from '../note-editor.js';
import { ui, closeModal, toast } from '../../ui.js';
import { renderApplication } from '../../app.js';

export const noteSubmissions = {
  note: async (form) => {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
    const payload = collectNotePayload(form);
    if (!payload.title) {
      showFormError(form, 'Judul catatan atau tugas wajib diisi.');
      return;
    }
    const id = form.dataset.id;
    try {
      if (id) store.updateNote(id, payload);
      else store.saveNote(payload);
      closeModal({ silent: true });
      toast(id ? 'Perubahan disimpan.' : 'Catatan berhasil dibuat.', 'success');
      renderApplication();
    } catch (error) {
      console.error(error);
      showFormError(form, error.message || 'Gagal menyimpan catatan.');
    }
  },
};
