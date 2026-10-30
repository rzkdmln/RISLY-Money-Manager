import {
  APP,
  CLOUD_PROVIDERS,
  LOCK_OPTIONS,
  THEME_OPTIONS,
  WEEK_OPTIONS,
} from '../config.js';
import { Cloud } from '../cloud.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import {
  avatar,
  badge,
  pageHeader,
  prefs,
  spinner,
  syncPill,
} from '../ui.js';
import {
  escapeAttr,
  escapeHTML,
  formatBytes,
  formatDateTime,
  isIos,
  isStandalone,
} from '../utils.js';

function cloudFields(config) {
  const provider = config.provider || 'local';
  const jsonbin = config.jsonbin || {};
  const supabase = config.supabase || {};
  const firebase = config.firebase || {};
  return `<div class="cloud-provider-select">
    <label class="field-label">Penyedia sinkronisasi
      <select class="field mt-1.5" id="cloud-provider" name="provider" data-action="cloud-provider-change">
        ${Object.entries(CLOUD_PROVIDERS).map(([id, item]) => `<option value="${id}" ${provider === id ? 'selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}
      </select>
    </label>
    <p class="text-[11px] leading-5 text-slate-500 dark:text-slate-400" id="cloud-provider-help">${escapeHTML(CLOUD_PROVIDERS[provider]?.description || '')}</p>
  </div>

  <div class="cloud-fields" data-provider-section="jsonbin" ${provider === 'jsonbin' ? '' : 'hidden'}>
    <label class="field-label">Bin ID
      <input class="field mt-1.5" name="jsonbinBinId" value="${escapeAttr(jsonbin.binId || '')}" placeholder="65f…">
    </label>
    <label class="field-label">Master Key
      <input class="field mt-1.5" name="jsonbinMasterKey" type="password" value="${escapeAttr(jsonbin.masterKey || '')}" placeholder="$2a$10$…" autocomplete="off">
    </label>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn btn-secondary btn-sm" data-action="create-jsonbin">${icon('database', 'w-3.5 h-3.5')} Buat bin baru</button>
      <span class="text-[11px] text-slate-400 self-center">Master key hanya disimpan di perangkat ini.</span>
    </div>
  </div>

  <div class="cloud-fields" data-provider-section="supabase" ${provider === 'supabase' ? '' : 'hidden'}>
    <label class="field-label">Project URL
      <input class="field mt-1.5" name="supabaseUrl" value="${escapeAttr(supabase.url || '')}" placeholder="https://xxxx.supabase.co">
    </label>
    <label class="field-label">Anon key
      <input class="field mt-1.5" name="supabaseAnonKey" type="password" value="${escapeAttr(supabase.anonKey || '')}" placeholder="eyJhbGciOi…" autocomplete="off">
    </label>
    <div class="grid grid-cols-2 gap-3">
      <label class="field-label">Tabel
        <input class="field mt-1.5" name="supabaseTable" value="${escapeAttr(supabase.table || 'households')}" placeholder="households">
      </label>
      <label class="field-label">Row ID
        <input class="field mt-1.5" name="supabaseRowId" value="${escapeAttr(supabase.rowId || APP.householdId)}" placeholder="${escapeAttr(APP.householdId)}">
      </label>
    </div>
  </div>

  <div class="cloud-fields" data-provider-section="firebase" ${provider === 'firebase' ? '' : 'hidden'}>
    <label class="field-label">Konfigurasi Firebase (JSON)
      <textarea class="field textarea mt-1.5 font-mono text-[11px]" name="firebaseConfigJson" rows="6" placeholder='{"apiKey":"…","authDomain":"…","databaseURL":"https://….firebaseio.com","projectId":"…","appId":"…"}'>${escapeHTML(typeof firebase.configJson === 'string' ? firebase.configJson : JSON.stringify(firebase.configJson || {}, null, 2))}</textarea>
    </label>
    <label class="field-label">Path database
      <input class="field mt-1.5" name="firebasePath" value="${escapeAttr(firebase.path || `households/${APP.householdId}`)}" placeholder="households/risly-family">
    </label>
    <p class="text-[11px] leading-5 text-slate-500 dark:text-slate-400">Firebase RTDB memakai listener real-time. Lindungi database dengan rules yang membatasi akses.</p>
  </div>

  <div class="cloud-security-note">
    ${icon('shield', 'w-4 h-4')}
    <p>PIN aplikasi bukan enkripsi. Kunci API dan data cloud dapat dibaca dari perangkat yang terbuka. Gunakan kunci rahasia, kode perangkat, dan aturan backend yang ketat.</p>
  </div>`;
}

function notificationStatus() {
  if (!('Notification' in window)) return { label: 'Tidak didukung', tone: 'slate', canAsk: false };
  if (Notification.permission === 'granted') return { label: 'Aktif', tone: 'green', canAsk: false };
  if (Notification.permission === 'denied') return { label: 'Diblokir', tone: 'red', canAsk: false };
  return { label: 'Belum diizinkan', tone: 'amber', canAsk: true };
}

export function settingsView(user) {
  const config = Cloud.getConfig();
  const status = Cloud.getStatus();
  const notification = notificationStatus();
  const installed = isStandalone();
  const dataSize = new Blob([JSON.stringify(store.data)]).size;
  const txCount = store.transactions().length;
  const noteCount = store.notes().length;
  const swActive = Boolean(navigator.serviceWorker?.controller);
  const lockValue = Number(store.data.settings.autoLockMinutes);

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Preferensi keluarga',
      title: 'Pengaturan',
      subtitle: 'Keamanan, tampilan, sinkronisasi, dan data aplikasi.',
    })}

    <div class="settings-profile">
      ${avatar(user, 'lg')}
      <div class="min-w-0 flex-1">
        <p class="page-eyebrow">Masuk sebagai</p>
        <h2 class="text-xl font-bold text-slate-900 dark:text-white">${escapeHTML(user?.name || 'Pengguna')}</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHTML(store.data.settings.householdName)} · ${txCount} transaksi · ${noteCount} catatan</p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-profile">${icon('user', 'w-3.5 h-3.5')} Profil</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="lock-app">${icon('lock', 'w-3.5 h-3.5')} Kunci</button>
      </div>
    </div>

    <div class="settings-grid">
      <section class="card">
        <div class="card-heading">
          <div><p class="card-kicker">Keamanan</p><h2 class="section-title">PIN & sesi</h2></div>
          ${icon('shield', 'w-5 h-5 text-emerald-500')}
        </div>
        <div class="settings-list">
          <button type="button" class="settings-row" data-action="change-pin"><span class="settings-row-icon">${icon('lock', 'w-4 h-4')}</span><span class="flex-1"><strong>Ubah PIN</strong><small>PIN pribadi ${escapeHTML(user?.name || '')} (4–8 angka)</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</button>
          <div class="settings-row">
            <span class="settings-row-icon">${icon('clock', 'w-4 h-4')}</span>
            <span class="flex-1"><strong>Kunci otomatis</strong><small>Setelah tidak ada aktivitas</small></span>
            <select class="field field-compact w-32" data-setting="autoLockMinutes">
              ${LOCK_OPTIONS.map((option) => `<option value="${option.value}" ${lockValue === option.value ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}
            </select>
          </div>
          <button type="button" class="settings-row" data-action="notifications"><span class="settings-row-icon">${icon('bell', 'w-4 h-4')}</span><span class="flex-1"><strong>Notifikasi pengingat</strong><small>Untuk tugas dan catatan dengan pengingat</small></span>${badge(notification.label, notification.tone, 'badge-soft')}</button>
          <button type="button" class="settings-row" data-action="logout"><span class="settings-row-icon text-red-500">${icon('log-out', 'w-4 h-4')}</span><span class="flex-1"><strong class="text-red-500">Keluar dari sesi</strong><small>Kembali ke layar PIN</small></span></button>
        </div>
      </section>

      <section class="card">
        <div class="card-heading">
          <div><p class="card-kicker">Tampilan</p><h2 class="section-title">Nuansa aplikasi</h2></div>
          ${icon('palette', 'w-5 h-5 text-violet-500')}
        </div>
        <p class="field-label">Tema</p>
        <div class="theme-options">
          ${THEME_OPTIONS.map((option) => `<button type="button" class="theme-option ${prefs.theme === option.id ? 'is-active' : ''}" data-action="theme-set" data-theme="${option.id}">
            ${icon(option.icon, 'w-4 h-4')}<span>${escapeHTML(option.label)}</span>
          </button>`).join('')}
        </div>
        <div class="settings-list mt-4">
          <button type="button" class="settings-row" data-action="toggle-privacy"><span class="settings-row-icon">${icon(prefs.hideAmounts ? 'eye-off' : 'eye', 'w-4 h-4')}</span><span class="flex-1"><strong>Sembunyikan nominal</strong><small>Samarkan angka saat layar dilihat orang lain</small></span><span class="switch ${prefs.hideAmounts ? 'is-on' : ''}"></span></button>
          <div class="settings-row">
            <span class="settings-row-icon">${icon('calendar', 'w-4 h-4')}</span>
            <span class="flex-1"><strong>Awal pekan</strong><small>Digunakan pada tampilan kalender</small></span>
            <select class="field field-compact w-28" data-setting="weekStartsOn">
              ${WEEK_OPTIONS.map((option) => `<option value="${option.value}" ${Number(store.data.settings.weekStartsOn) === option.value ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}
            </select>
          </div>
        </div>
      </section>

      <form class="card" data-form="settings-household">
        <div class="card-heading">
          <div><p class="card-kicker">Rumah tangga</p><h2 class="section-title">Identitas & anggaran</h2></div>
          ${icon('users', 'w-5 h-5 text-blue-500')}
        </div>
        <label class="field-label">Nama keluarga
          <input class="field mt-1.5" name="householdName" maxlength="60" value="${escapeAttr(store.data.settings.householdName)}" required>
        </label>
        <label class="field-label mt-3">Anggaran default bulanan
          <div class="input-with-prefix mt-1.5"><span>Rp</span><input class="field" type="number" name="defaultMonthlyBudget" min="0" step="1000" inputmode="numeric" value="${Math.round(store.data.settings.defaultMonthlyBudget)}"></div>
        </label>
        <p class="text-[11px] text-slate-400 mt-2">Dipakai saat bulan belum memiliki anggaran khusus.</p>
        <button type="submit" class="btn btn-primary w-full mt-4">${icon('save', 'w-4 h-4')} Simpan</button>
      </form>

      <section class="card">
        <div class="card-heading">
          <div><p class="card-kicker">Struktur</p><h2 class="section-title">Kategori & jadwal</h2></div>
          ${icon('tag', 'w-5 h-5 text-pink-500')}
        </div>
        <div class="settings-list">
          <a href="#/categories" class="settings-row" data-action="nav" data-route="categories"><span class="settings-row-icon">${icon('tag', 'w-4 h-4')}</span><span class="flex-1"><strong>Kelola kategori</strong><small>${store.categories().length} kategori aktif</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</a>
          <a href="#/recurring" class="settings-row" data-action="nav" data-route="recurring"><span class="settings-row-icon">${icon('repeat', 'w-4 h-4')}</span><span class="flex-1"><strong>Transaksi berulang</strong><small>${store.recurringRules().length} jadwal</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</a>
          <a href="#/budgets" class="settings-row" data-action="nav" data-route="budgets"><span class="settings-row-icon">${icon('chart-pie', 'w-4 h-4')}</span><span class="flex-1"><strong>Anggaran bulanan</strong><small>Batas dan ambang peringatan</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</a>
        </div>
      </section>
    </div>

    <section class="card" id="cloud-settings">
      <div class="card-heading">
        <div>
          <p class="card-kicker">Sinkronisasi dua perangkat</p>
          <h2 class="section-title">Cloud backend</h2>
        </div>
        <div class="flex items-center gap-2">${syncPill(status)}${badge(status.connected ? 'Terhubung' : 'Belum terhubung', status.connected ? 'green' : 'slate', 'badge-soft')}</div>
      </div>
      <div class="cloud-status-panel">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">${escapeHTML(status.providerLabel)}</p>
          <p class="text-xs ${status.state === 'error' ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'} mt-0.5">${escapeHTML(status.error || status.message || CLOUD_PROVIDERS[status.provider]?.description || 'Data lokal')}</p>
          <p class="text-[11px] text-slate-400 mt-1">${status.lastSyncAt ? `Terakhir sinkron ${formatDateTime(status.lastSyncAt)}` : 'Belum pernah tersinkron'}</p>
        </div>
        <div class="flex gap-2">
          ${status.provider !== 'local' ? `<button type="button" class="btn btn-secondary btn-sm" data-action="sync-now">${icon('refresh', 'w-3.5 h-3.5')} Sinkron</button>` : ''}
          ${status.provider !== 'local' ? `<button type="button" class="btn btn-danger-soft btn-sm" data-action="cloud-disconnect">Putuskan</button>` : ''}
        </div>
      </div>
      <form data-form="cloud" class="mt-5">
        ${cloudFields(config)}
        <div class="flex flex-wrap gap-2 mt-5">
          <button type="submit" class="btn btn-primary">${icon(status.connected ? 'refresh' : 'cloud', 'w-4 h-4')} ${status.connected ? 'Simpan & sambungkan ulang' : 'Simpan & hubungkan'}</button>
          <button type="button" class="btn btn-secondary" data-action="cloud-test">Uji koneksi</button>
        </div>
        <p class="text-[11px] text-slate-400 mt-3">JSONBin/Supabase memakai polling ±20 detik. Firebase memakai listener real-time. Data tetap bisa dipakai offline dari cache lokal.</p>
      </form>
    </section>

    <div class="settings-grid">
      <section class="card">
        <div class="card-heading">
          <div><p class="card-kicker">Cadangan</p><h2 class="section-title">Data & pemulihan</h2></div>
          ${icon('database', 'w-5 h-5 text-cyan-500')}
        </div>
        <div class="data-usage">
          <div><span>Ukuran data</span><strong>${formatBytes(dataSize)}</strong></div>
          <div><span>Transaksi</span><strong>${txCount}</strong></div>
          <div><span>Catatan</span><strong>${noteCount}</strong></div>
        </div>
        <div class="settings-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="export-backup">${icon('download', 'w-3.5 h-3.5')} Unduh backup JSON</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="import-backup">${icon('upload', 'w-3.5 h-3.5')} Pulihkan backup</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="load-sample">${icon('sparkles', 'w-3.5 h-3.5')} Muat data contoh</button>
          <button type="button" class="btn btn-danger-soft btn-sm" data-action="reset-app">${icon('trash', 'w-3.5 h-3.5')} Reset aplikasi</button>
        </div>
        <p class="text-[11px] leading-5 text-slate-400 mt-3">Backup JSON memuat transaksi, akun, anggaran, catatan, dan hash PIN. Simpan di tempat aman.</p>
      </section>

      <section class="card">
        <div class="card-heading">
          <div><p class="card-kicker">Aplikasi</p><h2 class="section-title">Instalasi & offline</h2></div>
          ${icon('device', 'w-5 h-5 text-slate-500')}
        </div>
        <div class="settings-list">
          <div class="settings-row"><span class="settings-row-icon">${icon('cloud', 'w-4 h-4')}</span><span class="flex-1"><strong>Service Worker</strong><small>${swActive ? 'Aktif — app shell tersimpan offline' : 'Mendaftar…'}</small></span>${badge(swActive ? 'Offline siap' : 'Menunggu', swActive ? 'green' : 'amber', 'badge-soft')}</div>
          <div class="settings-row"><span class="settings-row-icon">${icon('device', 'w-4 h-4')}</span><span class="flex-1"><strong>Mode aplikasi</strong><small>${installed ? 'Berjalan sebagai PWA standalone' : isIos() ? 'Tambahkan ke Layar Utama lewat Safari' : 'Dapat dipasang dari menu browser'}</small></span>${badge(installed ? 'Terpasang' : 'Browser', installed ? 'green' : 'slate', 'badge-soft')}</div>
          <button type="button" class="settings-row" data-action="install-help"><span class="settings-row-icon">${icon('info', 'w-4 h-4')}</span><span class="flex-1"><strong>Cara memasang di iPhone</strong><small>Safari → Bagikan → Tambahkan ke Layar Utama</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</button>
        </div>
        <button type="button" class="btn btn-secondary w-full mt-4" data-action="check-update">${icon('refresh', 'w-4 h-4')} Periksa pembaruan aplikasi</button>
      </section>
    </div>

    <section class="about-card">
      <span class="brand-mark">R</span>
      <div class="min-w-0">
        <p class="font-bold text-slate-900 dark:text-white">${APP.name} <span class="font-normal text-slate-400">v${APP.version}</span></p>
        <p class="text-xs text-slate-500 dark:text-slate-400">${APP.tagline} Dibuat ringan dengan HTML, Tailwind CSS, dan Vanilla JavaScript.</p>
      </div>
      <span class="text-[10px] text-slate-400 text-right">PWA · Offline-first<br>Data milik keluarga</span>
    </section>
  </div>`;
}
