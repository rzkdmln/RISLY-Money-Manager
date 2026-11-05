import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, money, pageHeader } from '../ui.js';
import { escapeAttr, escapeHTML, uid } from '../utils.js';

export function gameColor(i) {
  return `hsl(${(i * 137.508) % 360}, 70%, 60%)`;
}

export function gamesView() {
  const games = store.games();
  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Permainan',
      title: 'Games Roda Putar',
      actions: `<button type="button" class="btn btn-primary" data-action="open-game-editor">${icon('plus', 'w-4 h-4')} Roda baru</button>`,
    })}

    ${games.length ? `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      ${games.map((game) => {
        const choiceCount = game.choices?.length || 0;
        return `<article class="card min-w-0 overflow-hidden rounded-xl p-3 flex flex-col">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-semibold text-slate-900 dark:text-white truncate">${escapeHTML(game.name || 'Roda')} <span class="text-xs text-slate-400 ml-2">${game.context ? `• ${escapeHTML(game.context)}` : ''}</span></h3>
            <button type="button" class="icon-btn shrink-0" data-action="delete-game" data-id="${escapeAttr(game.id)}" aria-label="Hapus roda">${icon('trash', 'w-3 h-3 text-rose-500')}</button>
          </div>
          <div class="flex-1 mb-3">
            <div class="w-16 h-16 bg-slate-200 dark:bg-slate-800/60 rounded-full overflow-hidden relative mx-auto mb-2">
              ${(game.choices || []).slice(0, 8).map((c, i) => {
                const start = (i / Math.max(choiceCount, 1)) * 360;
                const end = ((i + 1) / Math.max(choiceCount, 1)) * 360;
                const p1 = (deg) => {
                  const rad = (deg * Math.PI) / 180;
                  return `${(Math.cos(rad) * 50 + 50).toFixed(1)}% ${(Math.sin(rad) * 50 + 50).toFixed(1)}%`;
                };
                return `<div class="absolute inset-0" style="clip-path: polygon(50% 50%, ${p1(start)}, ${p1(end)}); background:${escapeAttr(c.color || gameColor(i))}"></div>`;
              }).join('')}
              <div class="absolute inset-0 border-2 border-white rounded-full"></div>
              <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-rose-600 ring-1 ring-white shadow-sm rounded-full"></div>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 text-center">${choiceCount} pilihan</p>
          </div>
          <div class="flex gap-1 mt-auto">
            <button type="button" class="btn btn-primary flex-1 btn-sm" data-action="spin-game" data-id="${escapeAttr(game.id)}">${icon('refresh', 'w-3.5 h-3.5')} Putar</button>
            <button type="button" class="btn btn-secondary flex-1 btn-sm" data-action="open-game-editor" data-id="${escapeAttr(game.id)}">${icon('edit', 'w-3.5 h-3.5')}</button>
          </div>
        </article>`;
      }).join('')}
    </div>` : emptyState('target', 'Belum ada roda putar', 'Buat roda putar pertama untuk memutar keberuntungan Anda.', `<button type="button" class="btn btn-primary btn-sm" data-action="open-game-editor">${icon('plus', 'w-3.5 h-3.5')} Buat roda baru</button>`)}
  </div>`;
}

export function gameEditor(game = null) {
  const editing = Boolean(game?.id);
  const choices = (game?.choices || []).slice();
  const apiKey = store.data.settings?.openRouterKey || '';

  return `<form data-form="game" data-id="${escapeAttr(game?.id || '')}" class="modal-form" novalidate>
    <header class="modal-header">
      <div>
        <p class="modal-kicker">${editing ? 'Perbarui roda' : 'Roda baru'}</p>
        <h2 class="modal-title">${editing ? 'Ubah roda' : 'Roda putar baru'}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <label class="field-label">Nama roda
        <input class="field mt-1.5" name="name" maxlength="60" value="${escapeAttr(game?.name || '')}" placeholder="Contoh: Makan siang" required>
      </label>
      <label class="field-label">Konteks (opsional, untuk AI)
        <input class="field mt-1.5" name="context" maxlength="100" value="${escapeAttr(game?.context || '')}" placeholder="Contoh: Makan siang, Hadiah, Liburan">
      </label>
      <div class="flex items-center justify-between mt-2 mb-1">
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">Jumlah pilihan</span>
        <input type="number" name="choiceCount" min="1" max="20" value="${escapeAttr(choices.length > 0 ? choices.length : '')}" class="field w-20 text-center" required data-action="sync-choice-count">
      </div>
      <div class="space-y-1 mt-1" id="game-choices-list">
        ${choices.length > 0 ? choices.map((c, i) => `
          <div class="flex gap-1 items-center bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2">
            <span class="w-2 h-2 rounded-full shrink-0" style="background:${escapeAttr(c.color || gameColor(i))}"></span>
            <input class="field flex-1" name="choice_${i}" value="${escapeAttr(c.text || '')}" placeholder="Pilihan ${i + 1}">
            <button type="button" class="icon-btn text-rose-500 shrink-0" data-action="remove-choice" data-index="${i}">${icon('x', 'w-3 h-3')}</button>
          </div>`).join('') : ''}
        <div id="game-choices-empty" class="text-[11px] text-slate-400 mt-1 hidden">${choices.length === 0 ? 'Ketik jumlah pilihan di atas, lalu isi setiap opsi.' : ''}</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm w-full mt-2" data-action="add-choice">${icon('plus', 'w-3 h-3')} Tambah pilihan</button>

      ${apiKey ? `<button type="button" class="btn btn-secondary btn-sm w-full mt-3" data-action="ai-generate-choices">${icon('circle-dot', 'w-3.5 h-3.5')} Buat pilihan dengan AI</button>` : `<div class="mt-3 p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30">
        <p class="text-[11px] text-amber-700 dark:text-amber-300">Masukkan API Key OpenRouter di Pengaturan agar AI dapat membuat pilihan otomatis.</p>
      </div>`}

      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      <div class="flex gap-2">
        ${editing ? `<button type="button" class="btn btn-danger-soft btn-sm" data-action="delete-game" data-id="${escapeAttr(game.id)}">${icon('trash', 'w-3 h-3')} Hapus</button>` : ''}
      </div>
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${editing ? icon('save', 'w-4 h-4') + ' Simpan' : icon('check', 'w-4 h-4') + ' Buat roda'}</button>
      </div>
    </footer>
  </form>`;
}

export function gameWheel(game) {
  const choices = game.choices || [];
  const segmentCount = Math.max(choices.length, 1);
  const segmentDeg = 360 / segmentCount;

  const point = (deg) => {
    const rad = (deg * Math.PI) / 180;
    const x = Math.cos(rad) * 100 + 50;
    const y = Math.sin(rad) * 100 + 50;
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  };

  return `<div class="flex flex-col items-center justify-center min-h-[60vh] px-3 sm:px-6 gap-4">
    <div class="relative w-full max-w-[280px] aspect-square">
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="w-1 h-5 bg-rose-600 shadow-[0_0_8px_rgba(220,38,38,0.4)]"></div>
      </div>
      <div class="wheel w-full h-full relative overflow-hidden rounded-full border-4 border-white dark:border-slate-800 shadow-lg transform transition-transform duration-[5s] ease-out" id="game-wheel" style="transform: rotate(0deg)">
        ${choices.map((c, i) => {
          const start = i * segmentDeg;
          return `<div class="absolute inset-0" style="clip-path: polygon(50% 50%, ${point(start)}, ${point(start + segmentDeg)}); background:${escapeAttr(c.color || gameColor(i))}"></div>
          <div class="absolute inset-0 flex items-center justify-center" style="transform: rotate(${start + segmentDeg / 2}deg) translateY(-72%) rotate(${-start - segmentDeg / 2}deg)">
            <span class="text-white font-bold text-[11px] sm:text-xs leading-none whitespace-nowrap filter drop-shadow([0_0_3px_rgba(0,0,0,0.5)])">${escapeHTML(c.text)}</span>
          </div>`;
        }).join('')}
        <div class="absolute inset-0 border-2 border-white rounded-full pointer-events-none z-10"></div>
        <div class="absolute inset-0 w-full h-full bg-gradient-to-t from-transparent to-black/30 pointer-events-none rounded-full"></div>
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div class="w-2 h-2 rounded-full bg-red-600 ring-2 ring-white ring-offset-2 shadow-sm"></div>
        </div>
      </div>

      <div class="mt-5 flex flex-col items-center gap-2">
        <p id="game-result" class="text-center text-xl font-bold text-slate-900 dark:text-white hidden animate-pop"></p>
        <button type="button" class="btn btn-primary w-full sm:w-auto mt-2 shrink-0" data-action="do-spin" data-id="${escapeAttr(game.id)}">
          ${icon('rotate-ccw', 'w-5 h-5')} Putar Roda
        </button>
      </div>
    </div>
  </div>`;
}

export function gameFormHtml(game = null) {
  return gameEditor(game);
}

export async function aiGenerateChoices(context, count, apiKey) {
  const prompt = `Anda adalah asisten yang membuat pilihan untuk roda putar (spin the wheel).
Konteks: ${context || '(tidak ada)'}.
Buatlah ${count} pilihan singkat, bermakna, dan bervariasi berdasarkan konteks di atas.
Hanya berikan daftar pilihan, satu per baris, tanpa nomor, tanpa penjelasan tambahan.`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://risly.pages.dev/',
      'X-Title': 'RISLY Money Manager',
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3.5-super-vl:free',
      messages: [
        { role: 'system', content: 'Anda membuat daftar pilihan singkat untuk roda putar.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    }),
  });

  if (!res.ok) throw new Error(`AI gagal: ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return text.split('\n').map((line) => line.trim()).filter((line) => line).slice(0, count);
}
