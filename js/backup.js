/**
 * RISLY Money Manager — Backup & restore
 *
 * Handles local JSON backup/restore, app reset, and Google Drive backup/restore.
 */

/* Imports */
import { store } from './store.js';
import { toast, openModal, closeModal, confirmDialog, ui } from './ui.js';
import { icon } from './icons.js';
import {
  escapeAttr,
  escapeHTML,
  formatBytes,
  formatDateTime,
  downloadJSON,
  localDateISO,
  nowISO,
  readFileAsText,
} from './utils.js';
import { APP } from './config.js';
import { GoogleDrive, googleAccountBadge } from './gdrive.js';
import { clearSession } from './auth.js';
import { appHooks } from './app/hooks.js';

/* ------------------------------------------------------------------------ */
/*  Local backup                                                            */
/* ------------------------------------------------------------------------ */

export function backupNow() {
  const payload = {
    app: 'risly-money-manager',
    kind: 'risly-backup',
    version: APP.version,
    schemaVersion: APP.schemaVersion,
    exportedAt: nowISO(),
    data: store.exportSnapshot(),
  };
  downloadJSON(payload, `RISLY-backup-${localDateISO()}.json`);
  toast('Backup JSON berhasil diunduh.', 'success');
}

export function pickBackupFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const data = parsed?.data && parsed.app === 'risly-money-manager' ? parsed.data : parsed;
      if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.users)) {
        throw new Error('Struktur backup tidak dikenali.');
      }
      const ok = await confirmDialog({
        title: 'Pulihkan backup?',
        message: 'Seluruh data lokal saat ini akan diganti oleh isi backup. Tindakan ini tidak dapat dibatalkan.',
        confirmLabel: 'Pulihkan',
        danger: false,
        iconName: 'upload',
      });
      if (!ok) return;
      store.importData(data);
      const user = store.currentUser || store.activeUsers()[0];
      if (!user?.pinHash) {
        clearSession();
        store.setCurrentUser(null);
        ui.appMounted = false;
        appHooks.renderAuth();
      } else {
        ui.appMounted = false;
        appHooks.renderApplication();
      }
      toast('Backup berhasil dipulihkan.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Backup gagal dibaca.', 'error');
    }
  });
  input.click();
}

/* ------------------------------------------------------------------------ */
/*  Reset                                                                   */
/* ------------------------------------------------------------------------ */

export async function resetApplication() {
  const ok = await confirmDialog({
    title: 'Reset ruang ini?',
    message: 'Semua data, PIN, dan pengaturan ruang aktif akan dihapus dari perangkat ini. Ruang lain tidak terpengaruh.',
    confirmLabel: 'Reset sekarang',
    danger: true,
    iconName: 'alert-triangle',
  });
  if (!ok) return;
  clearSession();
  store.resetLocalData();
  ui.currentUser = null;
  ui.selectedUser = null;
  ui.locked = false;
  ui.appMounted = false;
  closeModal({ silent: true });
  appHooks.renderAuth();
  toast('Ruang direset.', 'info');
}

/* ------------------------------------------------------------------------ */
/*  Google Drive helpers                                                    */
/* ------------------------------------------------------------------------ */

export function driveFileStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function refreshDriveUi() {
  const account = GoogleDrive.getAccount();
  const connected = Boolean(account?.email);
  document.querySelectorAll('[data-gdrive-account]').forEach((node) => {
    node.innerHTML = googleAccountBadge(account);
  });
  document.querySelectorAll('[data-gdrive-when-connected]').forEach((node) => {
    node.hidden = !connected;
  });
  document.querySelectorAll('[data-drive-requires-google]').forEach((node) => {
    node.disabled = !connected;
    node.classList.toggle('is-disabled', !connected);
  });
}

/** Make sure we have a Drive token, signing in again when the old session expired. */
export async function ensureDriveAccess() {
  if (!GoogleDrive.isConnected()) {
    await appHooks.signInWithGoogleFlow();
    return;
  }
  try {
    await GoogleDrive.token();
  } catch {
    await appHooks.signInWithGoogleFlow();
  }
}

/* ------------------------------------------------------------------------ */
/*  Google Drive backup / restore                                           */
/* ------------------------------------------------------------------------ */

export async function driveBackupNow() {
  try {
    await ensureDriveAccess();
  } catch (error) {
    toast(error.message || 'Masuk dengan Google dulu untuk memakai backup Drive.', 'error');
    return;
  }
  const payload = {
    app: 'risly-money-manager',
    kind: 'risly-backup',
    version: APP.version,
    schemaVersion: APP.schemaVersion,
    exportedAt: nowISO(),
    data: store.exportSnapshot(),
  };
  try {
    const token = await GoogleDrive.token();
    const name = `${APP.driveBackupPrefix}${driveFileStamp()}.json`;
    await GoogleDrive.createFile(token, { name, content: JSON.stringify(payload) });
    const files = await GoogleDrive.listFiles(token);
    const backups = files.filter((file) => String(file.name || '').startsWith(APP.driveBackupPrefix));
    const stale = backups.slice(APP.driveBackupLimit);
    if (stale.length) {
      await Promise.allSettled(stale.map((file) => GoogleDrive.deleteFile(token, file.id)));
    }
    toast(`Backup tersimpan di Google Drive: ${name}`, 'success');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Backup ke Drive gagal.', 'error');
  }
}

export async function openDriveRestoreModal() {
  try {
    await ensureDriveAccess();
  } catch (error) {
    toast(error.message || 'Masuk dengan Google dulu untuk memakai backup Drive.', 'error');
    return;
  }
  let files = [];
  try {
    const token = await GoogleDrive.token();
    files = (await GoogleDrive.listFiles(token))
      .filter((file) => String(file.name || '').startsWith(APP.driveBackupPrefix))
      .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));
  } catch (error) {
    toast(error.message || 'Gagal membaca daftar backup di Drive.', 'error');
    return;
  }
  const list = files.length
    ? files.map((file) => `<button type="button" class="drive-backup-row" data-action="drive-restore-file" data-id="${escapeAttr(file.id)}">
        <span class="drive-backup-icon">${icon('file-text', 'w-4 h-4')}</span>
        <span class="min-w-0 flex-1"><strong>${escapeHTML(file.name)}</strong><small>${escapeHTML(formatDateTime(file.createdTime))} · ${escapeHTML(formatBytes(Number(file.size) || 0))}</small></span>
        ${icon('chevron-right', 'w-4 h-4 text-slate-400')}
      </button>`).join('')
    : `<div class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada backup di Google Drive.</div>`;
  openModal({
    size: 'md',
    html: `<div class="p-5 sm:p-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="page-eyebrow">Google Drive</p>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mt-1">Pulihkan dari Drive</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Pilih berkas backup. Data lokal saat ini akan diganti.</p>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="drive-backup-list mt-4">${list}</div>
      <button type="button" class="btn btn-secondary w-full mt-4" data-action="close-modal">Tutup</button>
    </div>`,
  });
}

export async function driveRestoreFile(fileId) {
  if (!fileId) return;
  const ok = await confirmDialog({
    title: 'Pulihkan backup dari Drive?',
    message: 'Seluruh data lokal saat ini akan diganti oleh isi backup. Tindakan ini tidak dapat dibatalkan.',
    confirmLabel: 'Pulihkan',
    danger: false,
    iconName: 'upload',
  });
  if (!ok) return;
  try {
    const token = await GoogleDrive.token();
    const text = await GoogleDrive.downloadFile(token, fileId);
    const parsed = JSON.parse(text);
    const data = parsed?.data && parsed.app === 'risly-money-manager' ? parsed.data : parsed;
    if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.users)) {
      throw new Error('Struktur backup tidak dikenali.');
    }
    store.importData(data);
    const account = GoogleDrive.getAccount();
    const accountEmail = String(account?.email || '').toLowerCase();
    let user = null;
    if (accountEmail) {
      user = store.ensureMember(account);
      store.registerAccount(account, store.workspaceId);
    } else {
      user = store.currentUser || store.activeUsers()[0] || null;
    }
    closeModal({ silent: true });
    if (!user) {
      appHooks.renderAuth();
      toast('Backup dari Drive berhasil dipulihkan.', 'success');
      return;
    }
    appHooks.enterApplication(user, { fresh: true });
    toast('Backup dari Drive berhasil dipulihkan.', 'success');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Pemulihan dari Drive gagal.', 'error');
  }
}
