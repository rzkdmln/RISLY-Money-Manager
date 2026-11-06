import {
  APP,
  LOCK_OPTIONS,
  THEME_OPTIONS,
  WEEK_OPTIONS,
} from '../config.js';
import { GoogleDrive, googleAccountBadge, googleGlyph } from '../gdrive.js';
import { store } from '../store.js';
import { Cloud } from '../cloud.js';
import { icon } from '../icons.js';
import {
  avatar,
  badge,
  pageHeader,
  prefs,
  syncPill,
} from '../ui.js';
import {
  escapeAttr,
  escapeHTML,
  formatBytes,
  formatDateTime,
} from '../utils.js';

function notificationStatus() {
  if (!('Notification' in window)) return { label: 'Tidak didukung', tone: 'slate', canAsk: false };
  if (Notification.permission === 'granted') return { label: 'Aktif', tone: 'green', canAsk: false };
  if (Notification.permission === 'denied') return { label: 'Diblokir', tone: 'red', canAsk: false };
  return { label: 'Belum diizinkan', tone: 'amber', canAsk: true };
}

function googleDriveCard(user, driveConnected) {
  const account = GoogleDrive.getAccount();
  const inviteCode = store.getWorkspaceCode();
  return `<section class="card" id="google-drive">
    <div class="card-heading">
      <div><p class="card-kicker">Google</p><h2 class="section-title">Akun & backup</h2></div>
      ${icon('cloud', 'w-5 h-5 text-blue-500')}
    </div>

    <div data-gdrive-account>${googleAccountBadge(account)}</div>

    <div class="settings-list mt-4">
      <div class="settings-row">
        <span class="settings-row-icon">${icon('users', 'w-4 h-4')}</span>
        <span class="flex-1">
          <strong>${escapeHTML(store.data.settings.workspaceName || store.data.settings.householdName)}</strong>
          <small>Kode undangan: ${escapeHTML(inviteCode)}</small>
        </span>
        <button type="button" class="btn btn-ghost btn-sm" data-action="copy-invite" data-id="${escapeAttr(inviteCode)}">${icon('copy', 'w-3.5 h-3.5')} Salin</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="rotate-invite">${icon('refresh', 'w-3.5 h-3.5')} Baru</button>
      </div>

      <div class="settings-row">
        <span class="settings-row-icon">${icon('cloud', 'w-4 h-4')}</span>
        <span class="flex-1"><strong>Cloud ruang</strong><small>${escapeHTML(Cloud.getStatus().providerLabel)}${Cloud.getStatus().provider === 'local' ? ' - belum tersinkron' : ''}</small></span>
      </div>
    </div>

    ${driveConnected ? `<div class="settings-actions mt-4">
      <button type="button" class="btn btn-secondary btn-sm" data-action="drive-backup" data-drive-requires-google>${icon('cloud', 'w-3.5 h-3.5')} Backup sekarang</button>
      <button type="button" class="btn btn-secondary btn-sm" data-action="drive-restore" data-drive-requires-google>${icon('upload', 'w-3.5 h-3.5')} Pulihkan</button>
      <button type="button" class="btn btn-secondary btn-sm" data-action="google-join">${icon('users', 'w-3.5 h-3.5')} Gabung ruang lain</button>
      <button type="button" class="btn btn-secondary btn-sm" data-action="gdrive-signout">${icon('log-out', 'w-3.5 h-3.5')} Ganti akun</button>
    </div>`
      : `<button type="button" class="btn btn-secondary w-full mt-4" data-action="gdrive-signin">${googleGlyph('w-4 h-4')} Masuk dengan Google</button>`}
  </section>`;
}

export function settingsView(user) {
  const notification = notificationStatus();
  const dataSize = new Blob([JSON.stringify(store.data)]).size;
  const txCount = store.transactions().length;
  const noteCount = store.notes().length;
  const lockValue = Number(store.data.settings.autoLockMinutes);
  const driveConnected = GoogleDrive.isConnected();

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Pengaturan',
      title: 'Pengaturan',
      subtitle: 'Akun, keamanan, tampilan, dan data.',
    })}

    <div class="settings-profile">
      ${avatar(user, 'lg')}
      <div class="min-w-0 flex-1">
        <p class="page-eyebrow">Masuk sebagai</p>
        <h2 class="text-xl font-bold text-slate-900 dark:text-white">${escapeHTML(user?.name || 'Pengguna')}</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHTML(store.data.settings.workspaceName || store.data.settings.householdName)} · ${txCount} transaksi · ${noteCount} catatan</p>
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
          <button type="button" class="settings-row" data-action="change-pin"><span class="settings-row-icon">${icon('lock', 'w-4 h-4')}</span><span class="flex-1"><strong>${user?.pinHash ? 'Ubah PIN' : 'Buat PIN'}</strong><small>${user?.pinHash ? '4-8 angka' : 'Opsional - untuk kunci aplikasi'}</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</button>
          <button type="button" class="settings-row" data-action="open-auto-lock"><span class="settings-row-icon">${icon('clock', 'w-4 h-4')}</span><span class="flex-1"><strong>Kunci otomatis</strong><small>${escapeHTML(LOCK_OPTIONS.find((o) => o.value === lockValue)?.label || 'Tidak pernah')}</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</button>
          <button type="button" class="settings-row" data-action="notifications"><span class="settings-row-icon">${icon('bell', 'w-4 h-4')}</span><span class="flex-1"><strong>Notifikasi</strong><small>Pengingat tugas dan catatan</small></span>${badge(notification.label, notification.tone, 'badge-soft')}</button>
          <button type="button" class="settings-row" data-action="open-theme-modal"><span class="settings-row-icon">${icon('palette', 'w-4 h-4')}</span><span class="flex-1"><strong>Tema</strong><small>${escapeHTML(THEME_OPTIONS.find((o) => o.id === prefs.theme)?.label || 'Sistem')}</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</button>
          <button type="button" class="settings-row" data-action="toggle-privacy"><span class="settings-row-icon">${icon(prefs.hideAmounts ? 'eye-off' : 'eye', 'w-4 h-4')}</span><span class="flex-1"><strong>Sembunyikan nominal</strong><small>Samarkan angka saat dilihat orang</small></span><span class="switch ${prefs.hideAmounts ? 'is-on' : ''}"></span></button>
          <button type="button" class="settings-row" data-action="open-week-modal"><span class="settings-row-icon">${icon('calendar', 'w-4 h-4')}</span><span class="flex-1"><strong>Awal pekan</strong><small>${escapeHTML(WEEK_OPTIONS.find((o) => o.value === Number(store.data.settings.weekStartsOn))?.label || 'Senin')}</small></span>${icon('chevron-right', 'w-4 h-4 text-slate-400')}</button>
      </section>

      <section class="card" id="family-card">
        <div class="card-heading">
          <div><p class="card-kicker">Keluarga</p><h2 class="section-title">Identitas & anggaran</h2></div>
          ${icon('users', 'w-5 h-5 text-blue-500')}
        </div>
      <form data-form="settings-household">
        <label class="field-label">Nama ruang
          <input class="field mt-1.5" name="householdName" maxlength="60" value="${escapeAttr(store.data.settings.householdName)}" required>
        </label>
        <button type="submit" class="btn btn-primary w-full mt-4">${icon('save', 'w-4 h-4')} Simpan</button>
      </form>
      <div class="settings-list mt-4">
        ${store.activeUsers().map((member) => `<div class="settings-row">
          <span class="settings-row-icon">${avatar(member, 'xs')}</span>
          <span class="flex-1">
            <strong>${escapeHTML(member.name)}</strong>
            <small>${escapeHTML(member.googleEmail || 'Belum terhubung Google')}${member.id === user?.id ? ' · Anda' : ''}</small>
          </span>
          ${member.id !== user?.id ? `<button type="button" class="btn btn-danger-soft btn-sm" data-action="remove-member" data-id="${escapeAttr(member.id)}">${icon('x', 'w-3.5 h-3.5')} Keluarkan</button>` : ''}
        </div>`).join('')}
      </div>
    </section>

      ${googleDriveCard(user, driveConnected)}

      <section class="card">
        <div class="card-heading">
          <div><p class="card-kicker">Sistem</p><h2 class="section-title">Data & aplikasi</h2></div>
          ${icon('database', 'w-5 h-5 text-cyan-500')}
        </div>
        <div class="data-usage">
          <div><span>Ukuran data</span><strong>${formatBytes(dataSize)}</strong></div>
          <div><span>Transaksi</span><strong>${txCount}</strong></div>
          <div><span>Catatan</span><strong>${noteCount}</strong></div>
        </div>
        <div class="settings-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="export-backup">${icon('download', 'w-3.5 h-3.5')} Backup</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="import-backup">${icon('upload', 'w-3.5 h-3.5')} Restore</button>
          <button type="button" class="btn btn-danger-soft btn-sm" data-action="reset-app">${icon('trash', 'w-3.5 h-3.5')} Reset</button>
          <button type="button" class="btn btn-secondary btn-sm mt-2" data-action="check-update">${icon('refresh', 'w-4 h-4')} Periksa pembaruan</button>
        </div>
      </section>
    </div>

  </div>`;
}
