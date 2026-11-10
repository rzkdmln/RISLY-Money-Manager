/**
 * RISLY — Note Actions.
 * Domain: notes
 */

import { openNoteEditor } from '../modals.js';
import { store } from '../../store.js';
import {
  closeModal,
  confirmDialog,
  toast,
  savePrefs,
} from '../../ui.js';
import { renderApplication } from '../../app.js';

export const noteActions = {
  'add-note': () => {
    closeModal({ silent: true });
    openNoteEditor(null, 'note');
  },
  'add-todo': () => {
    closeModal({ silent: true });
    openNoteEditor(null, 'todo');
  },
  'edit-note': (element) => {
    const id = element.dataset.id;
    const note = store.noteById(id);
    if (!note) return;
    closeModal({ silent: true });
    openNoteEditor(note, note.kind);
  },
  'notes-tab': (element) => {
    ui.notesTab = element.dataset.tab || 'all';
    renderApplication();
  },
  'notes-tag': (element) => {
    ui.notesTag = element.dataset.tag || '';
    renderApplication();
  },
  'notes-view': (element) => {
    ui.notesView = element.dataset.view === 'list' ? 'list' : 'grid';
    savePrefs({ notesView: ui.notesView });
    renderApplication();
  },
  'note-pin': (element) => {
    const id = element.dataset.id;
    store.toggleNoteFlag(id, 'pinned');
    renderApplication();
  },
  'note-archive': async (element) => {
    const id = element.dataset.id;
    const note = store.noteById(id);
    if (!note) return;
    store.setNoteStatus(
      id,
      note.status === 'archived' ? 'active' : 'archived',
    );
    toast(
      note.status === 'archived'
        ? 'Catatan diaktifkan kembali.'
        : 'Catatan diarsipkan.',
      'success',
    );
    closeModal({ silent: true });
    renderApplication();
  },
  'note-restore': (element) => {
    const id = element.dataset.id;
    store.setNoteStatus(id, 'active');
    toast('Catatan dipulihkan.', 'success');
    closeModal({ silent: true });
    renderApplication();
  },
  'note-trash': (element) => {
    const id = element.dataset.id;
    const note = store.noteById(id);
    if (!note) return;
    store.setNoteStatus(id, 'trashed');
    toast('Catatan dipindahkan ke sampah.', 'success');
    closeModal({ silent: true });
    renderApplication();
  },
  'note-purge': async (element) => {
    const id = element.dataset.id;
    const note = store.noteById(id);
    if (!note) return;
    const ok = await confirmDialog({
      title: 'Hapus permanen?',
      message: `"${note.title}" akan dihapus dari perangkat ini dan semua perangkat yang tersinkron. Tindakan ini tidak dapat dibatalkan.`,
    });
    if (!ok) return;
    store.purgeNote(id);
    toast('Catatan dihapus permanen.', 'success');
    renderApplication();
  },
  'note-duplicate': (element) => {
    const id = element.dataset.id;
    const copy = store.duplicateNote(id);
    closeModal({ silent: true });
    toast('Catatan diduplikasi.', 'success');
    openNoteEditor(copy, copy.kind);
  },
  'empty-trash': async () => {
    const ok = await confirmDialog({
      title: 'Kosongkan sampah?',
      message:
        'Semua catatan di sampah akan dihapus permanen dari semua perangkat.',
      confirmLabel: 'Kosongkan',
    });
    if (!ok) return;
    const count = store.emptyTrash();
    toast(`${count} catatan dihapus permanen.`, 'success');
    renderApplication();
  },
  'todo-toggle': (element) => {
    const id = element.dataset.id;
    store.toggleTodoDone(id);
    renderApplication();
  },
  'todo-item-toggle': (element) => {
    store.toggleTodoItem(
      element.dataset.note,
      element.dataset.item,
    );
    renderApplication();
  },
};
