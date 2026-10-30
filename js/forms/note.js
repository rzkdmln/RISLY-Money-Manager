import { NOTE_COLORS, PRIORITIES } from '../config.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { escapeAttr, escapeHTML, sanitizeNoteHTML, toDateTimeLocal } from '../utils.js';

function noteColorPicker(selected) {
  return `<div class="note-color-picker" role="group" aria-label="Warna catatan">
    <input type="hidden" name="color" value="${escapeAttr(selected)}">
    ${Object.entries(NOTE_COLORS).map(([id, color]) => `<button type="button" class="note-color-dot ${selected === id ? 'is-active' : ''}" style="--note-swatch:${escapeAttr(color.bg)};--note-swatch-border:${escapeAttr(color.border)}" data-action="pick-note-color" data-color="${id}" aria-label="${escapeAttr(color.label)}" title="${escapeAttr(color.label)}"></button>`).join('')}
  </div>`;
}

export function todoItemRow(item = {}) {
  return `<div class="todo-item-row" data-item-id="${escapeAttr(item.id || '')}">
    <button type="button" class="todo-item-check ${item.done ? 'is-done' : ''}" data-action="toggle-draft-item" aria-label="Tandai item">${item.done ? icon('check', 'w-3 h-3') : ''}</button>
    <input class="todo-item-input" type="text" value="${escapeAttr(item.text || '')}" placeholder="Tulis sub-tugas…" maxlength="160">
    <div class="todo-item-actions">
      <button type="button" class="card-icon-btn" data-action="move-draft-item" data-dir="-1" aria-label="Naik">${icon('move-up', 'w-3 h-3')}</button>
      <button type="button" class="card-icon-btn" data-action="move-draft-item" data-dir="1" aria-label="Turun">${icon('move-down', 'w-3 h-3')}</button>
      <button type="button" class="card-icon-btn danger" data-action="remove-draft-item" aria-label="Hapus item">${icon('x', 'w-3 h-3')}</button>
    </div>
  </div>`;
}

export function noteEditorForm(note = null, kind = 'note') {
  const editing = Boolean(note?.id);
  const currentKind = note?.kind || kind;
  const isTodo = currentKind === 'todo';
  const color = note?.color || (isTodo ? 'blue' : 'yellow');
  const safeContent = sanitizeNoteHTML(note?.content || '');
  const items = note?.items?.length ? note.items : [{ id: '', text: '', done: false }];
  const tags = (note?.tags || []).join(', ');
  const status = note?.status || 'active';
  const isArchived = status === 'archived';
  const reminderValue = toDateTimeLocal(note?.reminderAt);

  return `<form data-form="note" data-id="${escapeAttr(note?.id || '')}" data-note-kind="${escapeAttr(currentKind)}" class="modal-form note-editor-form" novalidate>
    <header class="modal-header">
      <div class="min-w-0">
        <p class="modal-kicker">${editing ? (isArchived ? 'Diarsipkan' : 'Papan keluarga') : 'Catatan baru'}</p>
        <h2 class="modal-title">${editing ? (isTodo ? 'Detail tugas' : 'Catatan') : (isTodo ? 'Tugas baru' : 'Catatan baru')}</h2>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="note-save-status" id="note-save-status">${editing ? 'Tersimpan' : 'Belum disimpan'}</span>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </div>
    </header>

    <div class="modal-body note-editor-body" data-color="${escapeAttr(color)}">
      ${!editing ? `<div class="type-segment note-kind-segment">
        <button type="button" class="type-segment-btn ${!isTodo ? 'is-active' : ''}" data-action="note-form-kind" data-kind="note">${icon('sticky-note', 'w-4 h-4')} Catatan</button>
        <button type="button" class="type-segment-btn ${isTodo ? 'is-active' : ''}" data-action="note-form-kind" data-kind="todo">${icon('check-square', 'w-4 h-4')} Tugas</button>
      </div>` : ''}
      <input type="hidden" name="kind" value="${escapeAttr(currentKind)}">

      <div class="note-title-row">
        <input class="note-title-input" name="title" maxlength="120" value="${escapeAttr(note?.title || '')}" placeholder="${isTodo ? 'Apa yang perlu dilakukan?' : 'Judul catatan…'}" required>
        <div class="flex gap-1">
          <button type="button" class="card-icon-btn note-flag ${note?.pinned ? 'is-active' : ''}" data-action="toggle-form-pin" title="Sematkan">${icon('pin', 'w-4 h-4')}</button>
          <button type="button" class="card-icon-btn note-flag ${note?.favorite ? 'is-active' : ''}" data-action="toggle-form-favorite" title="Favorit">${icon('star', 'w-4 h-4')}</button>
        </div>
        <input type="hidden" name="pinned" value="${note?.pinned ? '1' : ''}">
        <input type="hidden" name="favorite" value="${note?.favorite ? '1' : ''}">
      </div>

      ${isTodo ? `
        <label class="field-label">Deskripsi
          <textarea class="field textarea mt-1.5" name="description" rows="3" maxlength="600" placeholder="Detail singkat tugas ini…">${escapeHTML(note?.content || '')}</textarea>
        </label>
        <div class="todo-editor">
          <div class="flex items-center justify-between">
            <p class="field-label">Checklist</p>
            <button type="button" class="link-button" data-action="add-todo-item">${icon('plus', 'w-3.5 h-3.5')} Tambah item</button>
          </div>
          <div class="todo-items" id="todo-items">${items.map((item) => todoItemRow(item)).join('')}</div>
        </div>
        <div class="form-grid">
          <label class="field-label">Tenggat
            <input class="field mt-1.5" type="date" name="dueDate" value="${escapeAttr(note?.dueDate || '')}">
          </label>
          <label class="field-label">Prioritas
            <select class="field mt-1.5" name="priority">
              ${Object.entries(PRIORITIES).map(([id, item]) => `<option value="${id}" ${(note?.priority || 'normal') === id ? 'selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}
            </select>
          </label>
        </div>
      ` : `
        <div class="note-toolbar" role="toolbar" aria-label="Format catatan">
          <button type="button" data-action="note-format" data-cmd="bold" aria-label="Tebal"><strong>B</strong></button>
          <button type="button" data-action="note-format" data-cmd="italic" aria-label="Miring"><em>I</em></button>
          <button type="button" data-action="note-format" data-cmd="underline" aria-label="Garis bawah"><u>U</u></button>
          <span></span>
          <button type="button" data-action="note-format" data-cmd="insertUnorderedList" aria-label="Daftar">${icon('layout-list', 'w-4 h-4')}</button>
          <button type="button" data-action="note-format" data-cmd="formatBlock" data-value="blockquote" aria-label="Kutipan">${icon('file-text', 'w-4 h-4')}</button>
          <button type="button" data-action="note-format" data-cmd="removeFormat" aria-label="Hapus format">${icon('x', 'w-4 h-4')}</button>
        </div>
        <div class="note-content-editor" contenteditable="true" data-note-content role="textbox" aria-multiline="true" data-placeholder="Tulis apa saja di sini…">${safeContent}</div>
        <input type="hidden" name="content" value="">
      `}

      <div class="form-grid">
        <div>
          <p class="field-label">Warna</p>
          <div class="mt-2">${noteColorPicker(color)}</div>
        </div>
        <label class="field-label">Tag
          <input class="field mt-1.5" name="tags" value="${escapeAttr(tags)}" placeholder="keluarga, keuangan, ide" maxlength="180">
        </label>
      </div>

      <label class="field-label">Pengingat (opsional)
        <input class="field mt-1.5" type="datetime-local" name="reminderAt" value="${escapeAttr(reminderValue)}">
      </label>
      <p class="text-[11px] text-slate-400 -mt-1">Notifikasi muncul saat aplikasi dibuka dan izin notifikasi aktif. Di iOS, pasang aplikasi ke Home Screen terlebih dahulu.</p>

      ${editing ? `<div class="note-editor-meta">
        <span>Dibuat ${escapeHTML(note.createdByName || '—')} · ${escapeHTML(new Date(note.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))}</span>
        <span>${isTodo ? (note.done ? 'Selesai' : 'Belum selesai') : 'Catatan'}</span>
      </div>` : ''}
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>

    <footer class="modal-footer note-editor-footer">
      ${editing ? `<div class="flex items-center gap-1">
        <button type="button" class="card-icon-btn" data-action="note-duplicate" data-id="${escapeAttr(note.id)}" title="Duplikat">${icon('copy', 'w-4 h-4')}</button>
        <button type="button" class="card-icon-btn" data-action="${isArchived ? 'note-restore' : 'note-archive'}" data-id="${escapeAttr(note.id)}" title="${isArchived ? 'Aktifkan' : 'Arsipkan'}">${icon(isArchived ? 'rotate-ccw' : 'archive', 'w-4 h-4')}</button>
        <button type="button" class="card-icon-btn danger" data-action="note-trash" data-id="${escapeAttr(note.id)}" title="Pindahkan ke sampah">${icon('trash', 'w-4 h-4')}</button>
      </div>` : '<span></span>'}
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Tutup</button>
        <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} ${editing ? 'Simpan' : 'Simpan catatan'}</button>
      </div>
    </footer>
  </form>`;
}
