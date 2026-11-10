/**
 * RISLY — Auth Actions.
 * Domain: auth
 */

import { openForgotPinModal, openAuthCloudModal } from '../modals.js';
import { Cloud } from '../../cloud.js';
import { store } from '../../store.js';
import { clearSession } from '../../auth.js';
import {
  ui,
  closeModal,
  confirmDialog,
  toast,
} from '../../ui.js';
import { renderAuth } from '../runtime.js';

export const authActions = {
  'select-user': (element) => {
    ui.selectedUser = element.dataset.user;
    renderAuth();
  },
  'toggle-pin': (element) => {
    const input = document.getElementById('pin-input');
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    element.innerHTML = icon(show ? 'eye-off' : 'eye', 'w-4.5 h-4.5');
    input.focus();
  },
  'forgot-pin': () => {
    openForgotPinModal();
  },
  'auth-cloud': () => {
    openAuthCloudModal();
  },
  'auth-reload-cloud': async () => {
    closeModal({ silent: true });
    const result = await Cloud.syncNow();
    if (result.ok) {
      renderAuth();
      toast('Data cloud dimuat. Coba masuk kembali.', 'success');
    } else {
      toast(
        'Gagal memuat data cloud. Periksa koneksi dan konfigurasi.',
        'error',
      );
    }
  },
  'auth-reset-local': async () => {
    const ok = await confirmDialog({
      title: 'Reset perangkat ini?',
      message:
        'Data lokal dan koneksi cloud akan dihapus. Data cloud tetap ada, tetapi Anda perlu mengatur ulang PIN di perangkat ini.',
      confirmLabel: 'Reset perangkat',
    });
    if (!ok) return;
    try {
      await Cloud.disconnect();
    } catch {
      /* noop */
    }
    store.resetLocalData();
    clearSession();
    ui.locked = false;
    ui.selectedUser = null;
    closeModal({ silent: true });
    renderAuth();
  },
};
