/**
 * RISLY — Boot.
 * Extracted from js/app.js section "Boot".
 */

import {
  root,
  setSplashStatus,
  hideSplash,
  scheduleRender,
  renderApplication,
  renderAuth,
  navigate,
} from './runtime.js';
import { enterApplication, runRecurring, checkReminders } from './session.js';
import { store } from '../core/store.js';
import { Cloud } from '../services/cloud.js';
import { ui, toast, savePrefs } from '../ui/ui.js';
import { isStandalone } from '../core/utils.js';
import { bindEvents } from './events.js';
import { setupInstallPrompt, registerServiceWorker } from './pwa.js';
import { initPullToRefresh } from '../ui/pull-to-refresh.js';
import { warmUpGoogleAuth } from '../services/google-auth-relay.js';
import { driveBackupNow } from '../services/backup.js';
import { GoogleDrive, purgeLegacyGdriveCookies } from '../services/gdrive.js';
import { updateSyncSlots } from '../views/shell.js';
import {
  getSession,
  isSessionExpired,
  clearSession,
  createSession,
} from '../core/auth.js';
import { resolveLockUser, showLockedWorkspace } from './lock.js';
import { clearGoogleAuthRedirectPending } from '../services/google-auth-relay.js';
import { ROUTES, APP } from '../core/config.js';
import {
  hasPendingGoogleAuthRedirect,
  completeGoogleAuthLogin,
} from '../services/google-auth-relay.js';
import { isIos } from '../core/utils.js';

function bindStore() {
  store.subscribe((event) => {
    if (event.silent) {
      updateSyncSlots(Cloud.getStatus());
      return;
    }
    scheduleRender(event.reason === 'sync:merge' ? 20 : 50);
  });

  Cloud.onStatus((status) => {
    updateSyncSlots(status);
    const pill = document.getElementById('cloud-live-status');
    if (pill) pill.innerHTML = status.error || status.message || status.providerLabel;
  });
}

async function tryResumeRedirectLogin() {
  if (!hasPendingGoogleAuthRedirect()) return false;

  try {
    const session = await completeGoogleAuthLogin();
    if (session?.account?.email) {
      GoogleDrive.adoptSession(session);
      const result = await store.signInWithGoogle(session.account);
      if (result.locked) {
        await showLockedWorkspace(result.workspaceId, {
          userId: session.account.userId || null,
          name: session.account.name || '',
        });
        return true;
      }
      await enterApplication(result.user, { fresh: result.created });
      toast(`Masuk sebagai ${result.user.name}.`, 'success');
      return true;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return false;
    if (error?.code === 'WORKSPACE_LOCKED') {
      await showLockedWorkspace(error.workspaceId);
      return true;
    }
    console.warn('Gagal menangkap redirect result:', error);
  }

  try {
    const uid = await Promise.race([
      Cloud.waitForFirebaseUser(),
      new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);

    if (uid) {
      const user = Cloud.getCurrentFirebaseUser();
      if (user?.email) {
        GoogleDrive.adoptSession({
          account: {
            email: user.email || '',
            name: user.displayName || '',
            picture: user.photoURL || '',
            clientId: APP.googleClientId,
          },
          accessToken: String(user.accessToken || ''),
          expiresAt: Date.now() + 3600_000,
        });
        const result = await store.signInWithGoogle({
          email: user.email || '',
          name: user.displayName || '',
          picture: user.photoURL || '',
          clientId: APP.googleClientId,
        });
        if (result.locked) {
          await showLockedWorkspace(result.workspaceId, {
            userId: user.uid || null,
            name: user.displayName || '',
          });
          return true;
        }
        await enterApplication(result.user, { fresh: result.created });
        toast(`Masuk sebagai ${result.user.name}.`, 'success');
        return true;
      }
    }
  } catch (error) {
    console.warn('Gagal melanjutkan sesi Firebase:', error);
  }

  clearGoogleAuthRedirectPending();
  return false;
}

async function boot() {
  if (!root) {
    console.error('Elemen #app-root tidak ditemukan.');
    return;
  }

  setSplashStatus('Memuat data...');
  await store.init();
  // Hapus cookie Google Drive legacy (token tidak boleh disimpan di cookie).
  purgeLegacyGdriveCookies();
  setSplashStatus('Menyiapkan cloud...');
  Cloud.init(store);
  bindStore();
  bindEvents();
  initPullToRefresh();
  GoogleDrive.prepare().catch(() => {});
  void warmUpGoogleAuth();

  setSplashStatus('Memeriksa sesi...');
  const session = getSession();
  if (session?.workspaceId) {
    const encrypted = await store.isWorkspaceEncrypted(session.workspaceId);
    const opened = encrypted && !store.isUnlocked
      ? false
      : await store.openWorkspace(session.workspaceId, {
          account: store.accountForWorkspace(session.workspaceId),
        });

    // Workspace terenkripsi tetapi belum unlock → tampilkan layar kunci.
    if (encrypted && !store.isUnlocked) {
      const last = JSON.parse(localStorage.getItem(APP.lastAccountKey) || 'null') || {};
      const snapshot = await resolveLockUser({
        userId: session.userId,
        name: last.name,
        workspaceId: session.workspaceId,
      });
      clearSession();
      store.setLockedWorkspace(session.workspaceId);
      store.setCurrentUser(snapshot?.id || null);
      ui.currentUser = snapshot;
      ui.selectedUser = snapshot?.id || null;
      ui.locked = Boolean(snapshot);
      ui.appMounted = false;
      renderAuth();
    } else {
      let user = opened ? store.resolveUser(session.userId) : null;
      if (opened && !user) {
        const account = store.account;
        if (account?.email) user = store.ensureMember(account);
        else user = store.activeUsers()[0] || null;
      }
      const hasPin = Boolean(user?.pinHash || user?.pinVerifier);
      // Tanpa PIN, sesi tidak pernah dianggap kedaluwarsa karena tidak ada
      // layar kunci yang bisa dipakai untuk membuka kembali aplikasi.
      const expired = hasPin && isSessionExpired(session, store.data.settings.autoLockMinutes);
      if (!expired && user) {
        store.setCurrentUser(user.id);
        ui.currentUser = user;
        ui.selectedUser = user.id;
        if (session.userId !== user.id) createSession(user.id, session.workspaceId);
      } else if (user) {
        clearSession();
        store.setCurrentUser(user.id);
        ui.currentUser = user;
        ui.locked = hasPin;
      } else {
        clearSession();
        ui.locked = false;
      }
    }
  }

  setSplashStatus('Memeriksa pembaruan...');
  registerServiceWorker();

  if (!store.currentUser && !getSession()?.workspaceId) {
    const last = JSON.parse(localStorage.getItem(APP.lastAccountKey) || 'null');
    if (last?.workspaceId) {
      const encrypted = await store.isWorkspaceEncrypted(last.workspaceId);
      if (encrypted && !store.isUnlocked) {
        const snapshot = await resolveLockUser({
          userId: last.userId,
          name: last.name,
          workspaceId: last.workspaceId,
        });
        clearSession();
        store.setLockedWorkspace(last.workspaceId);
        store.setCurrentUser(snapshot?.id || null);
        ui.currentUser = snapshot;
        ui.selectedUser = snapshot?.id || null;
        ui.locked = Boolean(snapshot);
        ui.appMounted = false;
        renderAuth();
      } else {
        const opened = await store.openLastWorkspace();
        if (opened) {
          if (opened.hasPin) {
            store.setCurrentUser(opened.user.id);
            ui.currentUser = opened.user;
            ui.selectedUser = opened.user.id;
            ui.locked = true;
            ui.appMounted = false;
          } else {
            store.setCurrentUser(opened.user.id);
            ui.currentUser = opened.user;
            ui.selectedUser = opened.user.id;
            ui.locked = false;
            ui.appMounted = false;
            savePrefs({ lastUser: opened.user.id });
            createSession(opened.user.id, store.workspaceId);
            if (!location.hash || !ROUTES[String(location.hash).replace(/^#\//, '')]) {
              try {
                history.replaceState(null, '', '#/dashboard');
              } catch {
                /* noop */
              }
            }
          }
        }
      }
    }
  }

  if (!store.currentUser) {
    const hadPendingRedirect = hasPendingGoogleAuthRedirect();
    const resumed = await tryResumeRedirectLogin();
    if (!resumed) {
      if (hadPendingRedirect) {
        if (isIos() && isStandalone()) {
          toast(
            'Login Google di iOS standalone mungkin terhambat oleh keamanan Safari (ITP). Coba buka aplikasi di Safari biasa.',
            'info'
          );
        } else {
          toast('Login Google tidak dapat diselesaikan. Silakan coba lagi.', 'error');
        }
      }
      renderAuth();
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {
        /* noop */
      }
    }
  } else {
    if (!location.hash) {
      try {
        history.replaceState(null, '', '#/dashboard');
      } catch {
        /* noop */
      }
    }
    if (hasPendingGoogleAuthRedirect()) {
      completeGoogleAuthLogin()
        .then(async (session) => {
          if (!session?.account?.email) {
            clearGoogleAuthRedirectPending();
            return;
          }
          GoogleDrive.adoptSession(session);
          toast(`Google Drive terhubung sebagai ${session.account.email}.`, 'success');
          renderApplication();
          // Lanjutkan backup yang tertunda sebelum dialihkan ke login Google.
          if (sessionStorage.getItem('risly.pendingDriveBackup') === '1') {
            sessionStorage.removeItem('risly.pendingDriveBackup');
            // Pastikan token benar-benar valid sebelum melanjutkan backup,
            // agar tidak terjadinya loop redirect tak terbatas.
            try {
              await GoogleDrive.token();
              void driveBackupNow();
            } catch {
              // Token masih belum valid; biarkan pengguna klik "Backup sekarang"
              // lagi untuk memulai alur masuk Google secara interaktif.
            }
          }
        })
        .catch((error) => {
          clearGoogleAuthRedirectPending();
          console.warn('Gagal menyelesaikan redirect Google:', error);
        });
    }
    renderApplication();
    runRecurring({ notify: true });
    setTimeout(checkReminders, 1_500);
  }

  setupInstallPrompt();

  const finishSplash = () => {
    try {
      hideSplash();
    } catch {
      /* noop */
    }
  };
  if (store.hasWorkspace) {
    Cloud.bootstrap({ waitForAuth: true })
      .catch((error) => console.warn('Cloud bootstrap skipped:', error))
      .finally(finishSplash);
  } else {
    finishSplash();
  }

  if (location.search.includes('debug=1')) {
    window.__RISLY__ = { store, Cloud, navigate, version: APP.version };
  }
}

export { bindStore, tryResumeRedirectLogin, boot };
