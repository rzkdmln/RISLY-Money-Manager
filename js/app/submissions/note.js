/**
 * RISLY — Note Submissions.
 * Domain: notes
 */

import { showFormError } from '../../ui/ui.js';
import { noteSaveTimer, collectNotePayload } from '../note-editor.js';
import { store } from '../../core/store.js';
import { ui, closeModal, toast } from '../../ui/ui.js';
import { renderApplication } from '../runtime.js';

export const noteSubmissions = {
  note: async (form) => {
    clearTimeout(noteSaveTimer);
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
