/**
 * RISLY Money Manager — Note editor helpers.
 */

import { openModal } from '../ui.js';
import { store } from '../store.js';
import { sanitizeNoteHTML, parseDateTimeLocal } from '../utils.js';
import { noteEditorForm } from '../forms/note.js';

let noteSaveTimer = null;

function setNoteSaveStatus(text) {
  const node = document.getElementById('note-save-status');
  if (node) node.textContent = text;
}

function collectNotePayload(form) {
  const fd = new FormData(form);
  const kind = form.dataset.noteKind === 'todo' ? 'todo' : 'note';
  const tags = String(fd.get('tags') || '')
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean);

  const items = [...form.querySelectorAll('.todo-item-row')]
    .map((row) => ({
      id: row.dataset.itemId || undefined,
      text: String(row.querySelector('.todo-item-input')?.value || '').trim(),
      done: row.querySelector('.todo-item-check')?.classList.contains('is-done') || false,
    }))
    .filter((item) => item.text);

  const editor = form.querySelector('[data-note-content]');
  const content = kind === 'todo'
    ? String(fd.get('description') || '')
    : sanitizeNoteHTML(editor ? editor.innerHTML : fd.get('content'));

  const reminderRaw = String(fd.get('reminderAt') || '');
  const reminderDate = parseDateTimeLocal(reminderRaw);

  const payload = {
    kind,
    title: String(fd.get('title') || '').trim(),
    content,
    color: String(fd.get('color') || (kind === 'todo' ? 'blue' : 'yellow')),
    pinned: String(fd.get('pinned') || '') === '1',
    favorite: String(fd.get('favorite') || '') === '1',
    tags,
    items,
    reminderAt: reminderDate ? reminderDate.toISOString() : null,
  };

  if (kind === 'todo') {
    payload.dueDate = String(fd.get('dueDate') || '') || null;
    payload.priority = String(fd.get('priority') || 'normal');
  }
  return payload;
}

function scheduleNoteAutosave(form) {
  if (!form?.dataset.id) return;
  setNoteSaveStatus('Menyimpan…');
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    try {
      const payload = collectNotePayload(form);
      if (!payload.title) {
        setNoteSaveStatus('Judul masih kosong');
        return;
      }
      store.updateNote(form.dataset.id, payload, { silent: true });
      setNoteSaveStatus('Tersimpan otomatis');
    } catch (error) {
      console.error('Note autosave failed:', error);
      setNoteSaveStatus('Gagal menyimpan');
    }
  }, 1_500);
}

function flushNoteAutosave() {
  if (!noteSaveTimer) return;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = null;
  const form = document.querySelector('form[data-form="note"][data-id]');
  if (!form?.dataset.id) return;
  try {
    const payload = collectNotePayload(form);
    if (payload.title) store.updateNote(form.dataset.id, payload, { silent: true });
  } catch (error) {
    console.error('Note autosave flush failed:', error);
  }
}

function changeNoteEditorKind(form, kind) {
  const draft = collectNotePayload(form);
  draft.id = undefined;
  draft.kind = kind;
  if (kind === 'todo') {
    draft.items = draft.items?.length ? draft.items : [];
    draft.description = draft.content;
  }
  // noteEditorForm reads `content`; todo reads the same field into description.
  openModal({
    size: 'lg',
    className: 'form-modal note-modal',
    html: noteEditorForm(draft, kind),
  });
}

export { setNoteSaveStatus, collectNotePayload, scheduleNoteAutosave, flushNoteAutosave, changeNoteEditorKind };
