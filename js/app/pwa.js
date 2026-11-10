/**
 * RISLY — PWA & Notifications.
 * Extracted from js/app.js section "Notifications & PWA".
 */

import {
  renderApplication,
  setSplashStatus,
  hideSplash,
} from './runtime.js';
import { checkReminders } from './session.js';
import { store } from '../core/store.js';
import { Cloud } from '../services/cloud.js';
import {
  toast,
  prefs,
  savePrefs,
  setTheme,
  ui,
} from '../ui/ui.js';
import { isStandalone } from '../core/utils.js';

let swRegistration = null;

export async function requestNotifications() {
  if (!('Notification' in window)) {
    toast('Browser ini tidak mendukung notifikasi.', 'info');
    return;
  }
  if (Notification.permission === 'granted') {
    toast('Notifikasi sudah aktif.', 'success');
    checkReminders();
    return;
  }
  if (Notification.permission === 'denied') {
    toast('Notifikasi diblokir. Ubah izin di pengaturan browser.', 'error');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      toast('Notifikasi pengingat diaktifkan.', 'success');
      checkReminders();
    } else {
      toast('Izin notifikasi tidak diberikan.', 'info');
    }
    if (store.currentUser) renderApplication();
  } catch (error) {
    console.error(error);
    toast('Gagal meminta izin notifikasi.', 'error');
  }
}

export async function checkForUpdate() {
  if (!swRegistration) {
    toast('Service worker belum aktif. Muat ulang halaman setelah online.', 'info');
    return;
  }
  try {
    await swRegistration.update();
    toast(
      'Aplikasi sudah memeriksa pembaruan. Versi terbaru akan dipakai saat dibuka kembali.',
      'success',
    );
  } catch (error) {
    console.error(error);
    toast('Gagal memeriksa pembaruan.', 'error');
  }
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') {
    console.info('Service worker dilewati pada mode file://. Gunakan server lokal atau HTTPS.');
    return;
  }
  if (new URLSearchParams(location.search).has('nosw')) {
    console.info('Service worker dilewati karena parameter ?nosw.');
    return;
  }
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    swRegistration = registration;
    window.__rislySWRegistration = registration;
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Versi baru RISLY tersedia.', 'info', {
            label: 'Muat ulang',
            onClick: () => {
              let reloaded = false;
              const reloadPage = () => {
                if (reloaded) return;
                reloaded = true;
                window.location.reload();
              };
              navigator.serviceWorker.addEventListener('controllerchange', reloadPage, { once: true });
              worker.postMessage({ type: 'SKIP_WAITING' });
              setTimeout(reloadPage, 1200);
            },
          });
        }
      });
    });
  }).catch((error) => console.warn('Service worker gagal didaftarkan:', error));

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'RISLY_UPDATED') {
      console.info('RISLY shell updated:', event.data.version);
    }
  });
}

export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (prefs.installDismissed || isStandalone()) return;
    setTimeout(() => {
      toast('Pasang RISLY di layar utama untuk akses cepat dan mode offline.', 'info', {
        label: 'Pasang',
        onClick: async () => {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          const choice = await deferredInstallPrompt.userChoice.catch(() => null);
          deferredInstallPrompt = null;
          savePrefs({ installDismissed: true });
          if (choice?.outcome === 'accepted') toast('RISLY berhasil dipasang.', 'success');
        },
      });
    }, 3_500);
  });

  window.addEventListener('appinstalled', () => {
    savePrefs({ installDismissed: true });
    toast('RISLY berhasil dipasang di perangkat.', 'success');
  });
}

let deferredInstallPrompt = null;
