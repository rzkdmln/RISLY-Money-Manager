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
import { store } from '../store.js';
import { Cloud } from '../cloud.js';
import { ui, toast, savePrefs } from '../ui.js';
import { isStandalone } from '../utils.js';
import { bindEvents } from './events.js';
import { setupInstallPrompt, registerServiceWorker } from './pwa.js';
import { initPullToRefresh } from '../pull-to-refresh.js';
import { warmUpGoogleAuth } from '../google-auth-relay.js';
import { GoogleDrive } from '../gdrive.js';
import { updateSyncSlots } from '../views/shell.js';
import {
  getSession,
  isSessionExpired,
  clearSession,
  createSession,
} from '../auth.js';
import { clearGoogleAuthRedirectPending } from '../google-auth-relay.js';
import { ROUTES, APP } from '../config.js';
import {
  hasPendingGoogleAuthRedirect,
  completeGoogleAuthLogin,
} from '../google-auth-relay.js';
import { isIos } from '../utils.js';
import { transactionForm } from '../forms/transaction.js';

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
      enterApplication(result.user, { fresh: result.created });
      toast(`Masuk sebagai ${result.user.name}.`, 'success');
      return true;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return false;
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
        enterApplication(result.user, { fresh: result.created });
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
  store.init();
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
    const opened = store.openWorkspace(session.workspaceId, { account: store.accountForWorkspace(session.workspaceId) });
    let user = opened ? store.resolveUser(session.userId) : null;
    if (opened && !user) {
      const account = store.account;
      if (account?.email) user = store.ensureMember(account);
      else user = store.activeUsers()[0] || null;
    }
    const expired = isSessionExpired(session, store.data.settings.autoLockMinutes);
    if (!expired && user) {
      store.setCurrentUser(user.id);
      ui.currentUser = user;
      ui.selectedUser = user.id;
      if (session.userId !== user.id) createSession(user.id, session.workspaceId);
    } else if (user) {
      clearSession();
      store.setCurrentUser(user.id);
      ui.currentUser = user;
      ui.locked = Boolean(user.pinHash);
    } else {
      clearSession();
      ui.locked = false;
    }
  }

  try {
    if (store.workspaceId && store.data?.settings?.autoLockMinutes === 15) {
      store.updateSettings({ autoLockMinutes: 0 });
    }
  } catch { /* noop */ }

  setSplashStatus('Memeriksa pembaruan...');
  registerServiceWorker();

  if (!store.currentUser && !getSession()?.workspaceId) {
    const opened = store.openLastWorkspace();
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
          try { history.replaceState(null, '', '#/dashboard'); } catch { /* noop */ }
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
          toast('Login Google di iOS standalone mungkin terhambat oleh keamanan Safari (ITP). Coba buka aplikasi di Safari biasa.', 'info');
        } else {
          toast('Login Google tidak dapat diselesaikan. Silakan coba lagi.', 'error');
        }
      }
      renderAuth();
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* noop */ }
    }
  } else {
    if (!location.hash) {
      try { history.replaceState(null, '', '#/dashboard'); } catch { /* noop */ }
    }
    if (hasPendingGoogleAuthRedirect()) {
      completeGoogleAuthLogin().then((session) => {
        if (!session?.account?.email) {
          clearGoogleAuthRedirectPending();
          return;
        }
        GoogleDrive.adoptSession(session);
        toast(`Google Drive terhubung sebagai ${session.account.email}.`, 'success');
        renderApplication();
      }).catch((error) => {
        clearGoogleAuthRedirectPending();
        console.warn('Gagal menyelesaikan redirect Google:', error);
      });
    }
    renderApplication();
    runRecurring({ notify: true });
    setTimeout(checkReminders, 1_500);
  }

  setupInstallPrompt();

  if (location.search.includes('debug=1')) {
    try {
      const html = transactionForm(null, {});
      const match = html.match(/name="amountExpression"[^>]*>/);
      console.log('DEBUG amount input tag:', match ? match[0] : 'NOT FOUND');
    } catch (e) {
      console.error('DEBUG txform failed', e);
    }
  }
  if (location.search.includes('debug=1')) {
    try {
      const html = transactionForm(null, {});
      const idx = html.indexOf('name="time"');
      console.log('DEBUG time input:', html.slice(Math.max(0, idx - 80), idx + 120));
    } catch (e) {
      console.error('DEBUG timeform failed', e);
    }
  }

  const finishSplash = () => { try { hideSplash(); } catch { /* noop */ } };
  if (store.hasWorkspace) {
    Cloud.bootstrap({ waitForAuth: true })
      .then(() => { if (store.currentUser && !ui.locked) renderApplication(); })
      .catch((error) => console.warn('Cloud bootstrap skipped:', error))
      .finally(finishSplash);
  } else {
    finishSplash();
  }

  window.__RISLY__ = { store, Cloud, navigate, version: APP.version };
}

export { bindStore, tryResumeRedirectLogin, boot };
