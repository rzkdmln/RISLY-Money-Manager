/**
 * RISLY — Auth flow (Google sign-in).
 *
 * Implementasi asli alur login Google. Diimpor oleh js/app.js (facade) dan
 * dipasang ke appHooks agar backup.js tidak perlu mengimpor dari js/app.js.
 */

import { openModal, closeModal } from '../ui.js';
import { icon } from '../icons.js';
import { GoogleDrive } from '../gdrive.js';
import {
  startGoogleAuthRedirect,
  startGoogleAuthPopup,
} from '../google-auth-relay.js';

/* -------------------------------------------------------------------------- */
/*  Google waiting modal                                                      */
/* -------------------------------------------------------------------------- */

export function showGoogleWaitingModal({ onCancel }) {
  let done = false;
  const finish = (callback) => {
    if (done) return;
    done = true;
    callback?.();
  };
  openModal({
    size: 'sm',
    onClose: () => finish(onCancel),
    html: `<div class="p-5 sm:p-6 text-center">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
        ${icon('smartphone', 'w-6 h-6')}
      </span>
      <h2 class="mt-4 text-[17px] font-bold text-slate-900 dark:text-white">Menyelesaikan masuk</h2>
      <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Buka halaman Google untuk masuk dengan akun Anda, lalu kembali ke aplikasi ini.
        Proses akan selesai otomatis.
      </p>
      <button type="button" class="btn btn-secondary mt-5 w-full" data-google-cancel>Batalkan</button>
    </div>`,
  });
  document.querySelector('[data-google-cancel]')?.addEventListener('click', () => {
    finish(onCancel);
    closeModal({ silent: true });
  });
  return {
    close() {
      finish(null);
      closeModal({ silent: true });
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Redirect fallback check                                                   */
/* -------------------------------------------------------------------------- */

export function canFallbackToRedirect(error) {
  const code = String(error?.code || '');
  return code === 'auth/popup-blocked'
    || code === 'auth/operation-not-supported-in-this-environment'
    || code === 'auth/web-storage-unsupported'
    || code === 'auth/timeout';
}

/* -------------------------------------------------------------------------- */
/*  Redirect flow                                                             */
/* -------------------------------------------------------------------------- */

export async function startGoogleRedirectFlow() {
  const controller = new AbortController();
  const waiting = showGoogleWaitingModal({
    onCancel: () => controller.abort(),
  });
  try {
    await startGoogleAuthRedirect({ signal: controller.signal });
  } catch (error) {
    waiting.close();
    throw error;
  }
  return new Promise(() => {});
}

/* -------------------------------------------------------------------------- */
/*  Main sign-in flow                                                         */
/* -------------------------------------------------------------------------- */

export async function signInWithGoogleFlow() {
  try {
    const session = await startGoogleAuthPopup();
    GoogleDrive.adoptSession(session);
    return session.account;
  } catch (error) {
    if (!canFallbackToRedirect(error)) throw error;
    console.warn('Popup Google tidak tersedia, memakai redirect:', error);
  }
  return startGoogleRedirectFlow();
}
