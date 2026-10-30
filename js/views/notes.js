import { PRIORITIES } from '../config.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, pageHeader, prefs, savePrefs, ui } from '../ui.js';
import {
  escapeAttr,
  escapeHTML,
  includesSearch,
  normalizeSearch,
  stripHTML,
  todayISO,
} from '../utils.js';
import { noteCard } from './common.js';

const TABS = [
  { id: 'all', label: 'Semua' },
  { id: 'note', label: 'Catatan' },
  { id: 'todo', label: 'Tugas' },
  { id: 'favorite', label: 'Favorit' },
  { id: 'archived', label: 'Arsip' },
  { id: 'trashed', label: 'Sampah' },
];

function tabStatus(tab) {
  if (tab === 'archived') return 'archived';
  if (tab === 'trashed') return 'trashed';
  return 'active';
}

function filterNotes() {
  let notes = store.notes().filter((note) => note.status === tabStatus(ui.notesTab));
  if (ui.notesTab === 'note') notes = notes.filter((note) => note.kind === 'note');
  if (ui.notesTab === 'todo') notes = notes.filter((note) => note.kind === 'todo');
  if (ui.notesTab === 'favorite') notes = notes.filter((note) => note.favorite);
  if (ui.notesTag) notes = notes.filter((note) => note.tags?.includes(ui.notesTag));
  if (ui.notesQuery.trim()) {
    const query = normalizeSearch(ui.notesQuery);
    notes = notes.filter((note) => includesSearch([
      note.title,
      stripHTML(note.content),
      ...(note.tags || []),
      ...(note.items || []).map((item) => item.text),
    ].join(' '), query));
  }
  const sort = ui.notesSort;
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sort === 'due') {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (sort === 'priority') {
      return (PRIORITIES[b.priority]?.order || 0) - (PRIORITIES[a.priority]?.order || 0);
    }
    if (sort === 'title') return a.title.localeCompare(b.title, 'id');
    if (sort === 'manual') return a.order - b.order;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  return notes;
}

export function notesView() {
  if (!ui.notesView) ui.notesView = prefs.notesView || 'grid';
  const counts = store.noteCounts();
  const notes = filterNotes();
  const tags = store.noteTags();
  const dueCount = store.tasksDue(0).length;
  const tabCount = {
    all: counts.all,
    note: counts.note,
    todo: counts.todo,
    favorite: counts.favorite,
    archived: counts.archived,
    trashed: counts.trashed,
  };

  const tabHtml = TABS.map((tab) => `<button type="button" class="notes-tab ${ui.notesTab === tab.id ? 'is-active' : ''}" data-action="notes-tab" data-tab="${tab.id}">
    ${escapeHTML(tab.label)}
    <span>${tabCount[tab.id] || 0}</span>
  </button>`).join('');

  const tagsHtml = tags.length
    ? `<div class="notes-tag-bar min-w-0 w-full overflow-x-auto">
      <button type="button" class="tag-filter shrink-0 ${!ui.notesTag ? 'is-active' : ''}" data-action="notes-tag" data-tag="">Semua tag</button>
      ${tags.slice(0, 12).map((tag) => `<button type="button" class="tag-filter shrink-0 ${ui.notesTag === tag ? 'is-active' : ''}" data-action="notes-tag" data-tag="${escapeAttr(tag)}">#${escapeHTML(tag)}</button>`).join('')}
    </div>`
    : '';

  const banner = ui.notesTab === 'trashed'
    ? `<div class="notes-banner notes-banner-danger min-w-0 w-full">
        <div class="min-w-0 flex-1">${icon('trash', 'w-5 h-5 shrink-0')}<span><strong>Sampah</strong> — catatan di sini dapat dipulihkan. Hapus permanen akan menghilangkannya dari semua perangkat.</span></div>
        ${counts.trashed ? `<button type="button" class="btn btn-danger-soft btn-sm shrink-0" data-action="empty-trash">Kosongkan sampah</button>` : ''}
      </div>`
    : ui.notesTab === 'archived'
      ? `<div class="notes-banner min-w-0 w-full">${icon('archive', 'w-5 h-5 shrink-0')}<span>Catatan yang diarsipkan tidak muncul di daftar utama. Pulihkan kapan saja tanpa kehilangan isi.</span></div>`
      : '';

  const emptyCopy = {
    all: ['sticky-note', 'Belum ada catatan', 'Simpan ide, rencana, dan hal kecil yang ingin diingat berdua.'],
    note: ['sticky-note', 'Belum ada catatan', 'Buat catatan tempel berwarna untuk ide dan informasi penting.'],
    todo: ['check-square', 'Belum ada tugas', 'Susun to-do list dengan sub-tugas, prioritas, dan tenggat.'],
    favorite: ['star', 'Belum ada favorit', 'Tandai catatan atau tugas penting dengan bintang.'],
    archived: ['archive', 'Arsip kosong', 'Catatan yang diarsipkan akan muncul di sini.'],
    trashed: ['trash', 'Sampah kosong', 'Catatan yang dihapus akan muncul di sini sebelum dibersihkan permanen.'],
  }[ui.notesTab] || ['sticky-note', 'Tidak ada hasil', 'Coba kata kunci atau filter lain.'];
  const filtered = ui.notesQuery || ui.notesTag;
  const actions = ui.notesTab === 'trashed'
    ? ''
    : `<button type="button" class="btn btn-secondary" data-action="add-note">${icon('sticky-note', 'w-4 h-4')} Catatan</button>
       <button type="button" class="btn btn-primary" data-action="add-todo">${icon('plus', 'w-4 h-4')} Tugas</button>`;

  return `<div class="page-stack min-w-0 w-full overflow-hidden">
    ${pageHeader({
      eyebrow: 'Papan keluarga',
      title: 'Catatan & Tugas',
      subtitle: 'Sticky notes, checklist, pengingat, dan to-do list dalam satu papan.',
      actions,
    })}

    <div class="notes-overview min-w-0 w-full">
      <div class="notes-overview-copy min-w-0 flex-1">
        <span class="notes-overview-icon shrink-0">${icon('sparkles', 'w-5 h-5')}</span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-900 dark:text-white truncate">${dueCount > 0 ? `${dueCount} tugas perlu perhatian` : 'Papan kalian tertata rapi'}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${counts.all} catatan aktif · ${counts.todo} tugas · ${counts.favorite} favorit</p>
        </div>
      </div>
      ${dueCount > 0 ? badge(`${dueCount} jatuh tempo`, 'red', 'badge-soft') : badge('Semua terkendali', 'green', 'badge-soft')}
    </div>

    <div class="notes-toolbar card min-w-0 w-full overflow-hidden">
      <div class="notes-tabs min-w-0 w-full overflow-x-auto" role="tablist" aria-label="Jenis catatan">${tabHtml}</div>
      <div class="notes-controls min-w-0 w-full flex flex-wrap gap-2">
        <label class="search-field notes-search-field min-w-0 flex-1">
          ${icon('search', 'w-4 h-4')}
          <input class="field min-w-0 w-full" id="notes-search" type="search" placeholder="Cari catatan, tugas, tag…" value="${escapeAttr(ui.notesQuery)}">
        </label>
        <select class="field field-compact shrink-0" id="notes-sort" data-filter="notes-sort" aria-label="Urutkan catatan">
          <option value="updated" ${ui.notesSort === 'updated' ? 'selected' : ''}>Terakhir diubah</option>
          <option value="created" ${ui.notesSort === 'created' ? 'selected' : ''}>Terbaru</option>
          <option value="due" ${ui.notesSort === 'due' ? 'selected' : ''}>Tenggat</option>
          <option value="priority" ${ui.notesSort === 'priority' ? 'selected' : ''}>Prioritas</option>
          <option value="title" ${ui.notesSort === 'title' ? 'selected' : ''}>Judul A–Z</option>
          <option value="manual" ${ui.notesSort === 'manual' ? 'selected' : ''}>Urutan manual</option>
        </select>
        <div class="view-toggle shrink-0" role="group" aria-label="Tampilan">
          <button type="button" class="${ui.notesView === 'grid' ? 'is-active' : ''}" data-action="notes-view" data-view="grid" aria-label="Tampilan kartu">${icon('layout-grid', 'w-4 h-4')}</button>
          <button type="button" class="${ui.notesView === 'list' ? 'is-active' : ''}" data-action="notes-view" data-view="list" aria-label="Tampilan daftar">${icon('layout-list', 'w-4 h-4')}</button>
        </div>
      </div>
      ${tagsHtml}
    </div>

    ${banner}

    ${notes.length
      ? `<div class="notes-grid ${ui.notesView === 'list' ? 'notes-list-view' : ''} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0 w-full">
          ${notes.map((note) => noteCard(note, { view: ui.notesView })).join('')}
        </div>`
      : emptyState(...emptyCopy, ui.notesTab === 'trashed' || filtered ? '' : `<div class="flex gap-2 justify-center"><button type="button" class="btn btn-secondary btn-sm" data-action="add-note">Catatan</button><button type="button" class="btn btn-primary btn-sm" data-action="add-todo">Tugas</button></div>`)}
  </div>`;
}

export function tasksSheet() {
  const tasks = store.tasksDue(14);
  return `<div class="sheet-handle"></div>
    <div class="p-5 sm:p-6 min-w-0 w-full overflow-hidden">
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0 flex-1">
          <p class="page-eyebrow">Pengingat</p>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mt-1 truncate">Tugas terdekat</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">${todayISO()} · ${tasks.length} tugas dalam 14 hari</p>
        </div>
        <button type="button" class="icon-btn shrink-0" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="mt-4 space-y-2 min-w-0 w-full">
        ${tasks.length ? tasks.map((task) => `<button type="button" class="task-sheet-row min-w-0 w-full flex items-center gap-2 p-2.5 rounded-lg text-left" data-action="edit-note" data-id="${escapeAttr(task.id)}">
          <span class="mini-check shrink-0 ${task.done ? 'is-done' : ''}">${task.done ? icon('check', 'w-3 h-3') : ''}</span>
          <span class="min-w-0 flex-1 text-left">
            <span class="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">${escapeHTML(task.title)}</span>
            <span class="block text-[11px] truncate ${task.dueDate < todayISO() ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}">${escapeHTML(task.dueDate || 'Tanpa tenggat')}</span>
          </span>
          <span class="shrink-0">${badge(task.priority === 'urgent' ? 'Mendesak' : task.priority === 'high' ? 'Tinggi' : 'Tugas', task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'amber' : 'blue', 'badge-soft')}</span>
        </button>`).join('') : emptyState('check-square', 'Tidak ada tugas mendesak', 'Semua tugas terdekat sudah beres atau belum dijadwalkan.')}
      </div>
      <button type="button" class="btn btn-primary w-full mt-4" data-action="add-todo">${icon('plus', 'w-4 h-4')} Tambah tugas</button>
    </div>`;
}

export { TABS };
