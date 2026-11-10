/**
 * RISLY — Note Editor Actions.
 * Domain: note-editor
 */

import { changeNoteEditorKind } from '../note-editor.js';
import { todoItemRow } from '../../forms/note.js';
import { icon } from '../../icons.js';

export const noteEditorActions = {
  'note-form-kind': (element) => {
    const form = element.closest('form[data-form="note"]');
    if (form)
      changeNoteEditorKind(
        form,
        element.dataset.kind === 'todo' ? 'todo' : 'note',
      );
  },
  'toggle-form-pin': (element) => {
    toggleFormField(element, 'pinned');
  },
  'toggle-form-favorite': (element) => {
    toggleFormField(element, 'favorite');
  },
  'add-todo-item': (element) => {
    const form = element.closest('form[data-form="note"]');
    const container = form?.querySelector('#todo-items');
    if (container) {
      container.insertAdjacentHTML('beforeend', todoItemRow());
      container
        .lastElementChild?.querySelector('.todo-item-input')
        ?.focus();
    }
  },
  'remove-draft-item': (element) => {
    const row = element.closest('.todo-item-row');
    row?.remove();
  },
  'toggle-draft-item': (element) => {
    const row = element.closest('.todo-item-row');
    const check = row?.querySelector('.todo-item-check');
    if (!check) return;
    const done = !check.classList.contains('is-done');
    check.classList.toggle('is-done', done);
    check.innerHTML = done ? icon('check', 'w-3 h-3') : '';
  },
  'move-draft-item': (element) => {
    const row = element.closest('.todo-item-row');
    if (!row) return;
    const direction = Number(element.dataset.dir) || 1;
    if (direction < 0 && row.previousElementSibling)
      row.parentElement.insertBefore(row, row.previousElementSibling);
    if (direction > 0 && row.nextElementSibling)
      row.parentElement.insertBefore(row.nextElementSibling, row);
  },
  'note-format': (element) => {
    const form = element.closest('form[data-form="note"]');
    const editor = form?.querySelector('[data-note-content]');
    if (!editor) return;
    editor.focus();
    try {
      document.execCommand(
        element.dataset.cmd,
        false,
        element.dataset.value || null,
      );
    } catch {
      /* noop */
    }
  },
  'pick-note-color': (element) => {
    const form = element.closest('form[data-form="note"]');
    if (!form) return;
    const color = element.dataset.color;
    const hidden = form.querySelector('input[name="color"]');
    if (hidden) hidden.value = color;
    form.querySelectorAll('.note-color-dot').forEach((dot) =>
      dot.classList.toggle('is-active', dot === element),
    );
    const body = form.querySelector('.note-editor-body');
    if (body) body.dataset.color = color;
  },
};

function toggleFormField(element, field) {
  const form = element.closest('form[data-form="note"]');
  if (!form) return;
  const hidden = form.querySelector(`input[name="${field}"]`);
  if (!hidden) return;
  const next = hidden.value === '1' ? '' : '1';
  hidden.value = next;
  element.classList.toggle('is-active', next === '1');
}
