/**
 * RISLY — Session & recurring automation.
 *
 * Implementasi asli dari entitas sesi. Diimpor oleh js/app.js (facade) dan
 * dipasang ke appHooks agar backup.js tidak perlu mengimpor dari js/app.js.
 */

import { store } from '../core/store.js';
import { Cloud } from '../services/cloud.js';
import { ROUTES } from '../core/config.js';
import {
  clearSession,
  createSession,
  getSession,
  isSessionExpired,
} from '../core/auth.js';
import { ui, toast, closeModal, savePrefs } from '../ui/ui.js';
import { GoogleDrive } from '../services/gdrive.js';
import { clearPendingGoogleLogin } from '../services/google-auth-relay.js';
import { renderApplication, renderAuth } from './runtime.js';
import { openNoteEditor } from './modals.js';

let lastReminderCheck = 0;

/* -------------------------------------------------------------------------- */
/*  Cloud sync after login                                                    */
/* -------------------------------------------------------------------------- */

async function syncCloudAfterLogin() {
  try {
    const status = Cloud.getStatus();
    if (status.provider === 'local') return null;
    if (!status.connected) {
      const bootstrapped = await Cloud.bootstrap({ waitForAuth: true });
      if (bootstrapped?.local || bootstrapped?.skipped) return bootstrapped;
    }
    if (!Cloud.canSync()) return null;
    return await Cloud.syncNow({ silent: true });
  } catch (error) {
    console.warn('Sinkronisasi otomatis setelah login gagal:', error);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Enter / lock / leave application                                          */
/* -------------------------------------------------------------------------- */

export function enterApplication(user, { fresh = false } = {}) {
  store.setCurrentUser(user.id);
  ui.currentUser = user;
  ui.selectedUser = user.id;
  ui.locked = false;
  ui.appMounted = false;
  savePrefs({ lastUser: user.id });
  createSession(user.id, store.workspaceId);
  // Best-effort: minta browser tidak membersihkan data situs (khusus iOS/Safari ITP).
  if (navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => {});
  }
  if (!location.hash || !ROUTES[String(location.hash).replace(/^#\//, '')]) {
    try { history.replaceState(null, '', '#/dashboard'); } catch { /* noop */ }
  }
  renderApplication();
  if (fresh) toast(`Selamat datang, ${user.name}.`, 'success');
  runRecurring({ notify: true });
  try { store.recordNetWorthSnapshot(); } catch { /* ignore */ }
  setTimeout(checkReminders, 1_200);
  if (store.workspaceId) {
    void syncCloudAfterLogin();
  }
}

export function lockApplication({ expired = false } = {}) {
  if (!store.currentUser?.pinHash) {
    leaveApplication().catch(() => {});
    if (expired) toast('Sesi berakhir. Masuk kembali dengan Google.', 'info');
    return;
  }
  clearSession();
  ui.currentUser = store.currentUser;
  ui.locked = true;
  ui.appMounted = false;
  closeModal({ silent: true });
  renderAuth();
  if (expired) toast('Aplikasi terkunci karena tidak ada aktivitas.', 'info');
}

export async function leaveApplication() {
  clearSession();
  clearPendingGoogleLogin();
  store.setCurrentUser(null);
  ui.currentUser = null;
  ui.locked = false;
  ui.appMounted = false;
  closeModal({ silent: true });
  try { await GoogleDrive.signOut(); } catch { /* noop */ }
  try { await Cloud.signOutFirebase(); } catch { /* noop */ }
  renderAuth();
  toast('Anda sudah keluar.', 'info');
}

/* -------------------------------------------------------------------------- */
/*  Auto-lock                                                                 */
/* -------------------------------------------------------------------------- */

export function checkAutoLock() {
  const session = getSession();
  if (!session || !store.currentUser) return;
  if (isSessionExpired(session, store.data.settings.autoLockMinutes)) {
    lockApplication({ expired: true });
  }
}

/* -------------------------------------------------------------------------- */
/*  Recurring automation                                                      */
/* -------------------------------------------------------------------------- */

export function runRecurring({ notify = false } = {}) {
  try {
    const result = store.processRecurring();
    if (result.posted > 0 && notify) {
      toast(`${result.posted} transaksi berulang otomatis dicatat.`, 'success');
    }
    return result;
  } catch (error) {
    console.error('Recurring processing failed:', error);
    return { posted: 0, dates: [] };
  }
}

/* -------------------------------------------------------------------------- */
/*  Reminders                                                                 */
/* -------------------------------------------------------------------------- */

export function checkReminders() {
  if (!store.currentUser) return;
  const now = Date.now();
  if (now - lastReminderCheck < 45_000) return;
  lastReminderCheck = now;

  let due = [];
  try {
    due = store.remindersDue();
  } catch (error) {
    console.error(error);
    return;
  }
  if (!due.length) return;

  const canNotify = 'Notification' in window && Notification.permission === 'granted';
  due.forEach((note) => {
    if (canNotify) {
      try {
        const notification = new Notification(`Pengingat: ${note.title}`, {
          body: note.content ? note.content.replace(/<[^>]+>/g, ' ').slice(0, 120) : 'Catatan RISLY',
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: `risly-note-${note.id}`,
        });
        notification.onclick = () => {
          window.focus();
          openNoteEditor(note);
          notification.close();
        };
      } catch { /* some browsers require a service worker */ }
    }
    toast(`Pengingat: ${note.title}`, 'info');
    try { store.markReminderNotified(note.id); } catch { /* noop */ }
  });
}
