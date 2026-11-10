/**
 * RISLY — Cloud Actions.
 * Domain: cloud
 */

import { signInWithGoogleFlow } from '../auth-flow.js';
import { enterApplication } from '../session.js';
import { renderApplication, renderAuth } from '../runtime.js';
import { navigate } from '../runtime.js';
import { openJoinWorkspaceModal } from '../modals.js';
import { openAuthCloudModal } from '../modals.js';
import { Cloud } from '../../cloud.js';
import { GoogleDrive } from '../../gdrive.js';
import { store } from '../../store.js';
import { clearSession } from '../../auth.js';
import {
  ui,
  closeModal,
  confirmDialog,
  toast,
} from '../../ui.js';
import {
  backupNow,
  pickBackupFile,
  resetApplication,
  driveBackupNow,
  openDriveRestoreModal,
  driveRestoreFile,
  refreshDriveUi,
} from '../../backup.js';
import { testCloudFromForm, createJsonBinFromForm } from '../submissions/cloud.js';
import { CLOUD_PROVIDERS } from '../../config.js';

export const cloudActions = {
  'sync-now': async () => {
    const result = await Cloud.syncNow();
    if (result.ok) {
      toast('Sinkronisasi selesai.', 'success');
      if (store.currentUser) renderApplication();
      else renderAuth();
    } else if (result.local) {
      toast('Sinkronisasi cloud belum diaktifkan.', 'info');
      if (store.currentUser) navigate('settings');
      else openAuthCloudModal();
    } else if (!result.offline) {
      toast('Sinkronisasi gagal. Periksa koneksi.', 'error');
    }
  },
  'cloud-disconnect': async () => {
    const ok = await confirmDialog({
      title: 'Putuskan cloud?',
      message:
        'Data tetap tersimpan lokal di perangkat ini. Sinkronisasi otomatis akan berhenti sampai dihubungkan kembali.',
      confirmLabel: 'Putuskan',
    });
    if (!ok) return;
    await Cloud.disconnect();
    toast('Koneksi cloud diputuskan.', 'success');
    renderApplication();
  },
  'gdrive-signin': async (element) => {
    const label = element.innerHTML;
    element.disabled = true;
    element.textContent = 'Menghubungkan…';
    try {
      const account = await signInWithGoogleFlow();
      refreshDriveUi();
      if (store.currentUser) {
        ui.appMounted = false;
        renderApplication();
      } else {
        renderAuth();
      }
      toast(`Tersambung sebagai ${account.email}.`, 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Gagal masuk dengan Google.', 'error');
    } finally {
      element.disabled = false;
      element.innerHTML = label;
    }
  },
  'google-login': async (element) => {
    const label = element.innerHTML;
    element.disabled = true;
    element.textContent = 'Menghubungkan…';
    try {
      const account = await signInWithGoogleFlow();
      const result = await store.signInWithGoogle(account);
      closeModal({ silent: true });
      enterApplication(result.user);
      if (result.created) toast('Ruang baru dibuat.', 'success');
      else if (result.adopted) toast('Ruang keluarga dipulihkan.', 'success');
      else toast(`Masuk sebagai ${result.user.name}.`, 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Gagal masuk dengan Google.', 'error');
    } finally {
      element.disabled = false;
      element.innerHTML = label;
    }
  },
  'google-join': () => {
    openJoinWorkspaceModal();
  },
  'sync-family': async (element) => {
    const label = element.innerHTML;
    element.disabled = true;
    element.textContent = 'Menyinkronkan...';
    try {
      const result = await Cloud.syncNow();
      if (result?.ok) {
        ui.appMounted = false;
        renderApplication();
        toast('Ruang tersimpan ke cloud.', 'success');
      } else {
        toast('Gagal menyinkronkan ke cloud.', 'error');
      }
    } catch (error) {
      toast(error.message || 'Gagal menyinkronkan.', 'error');
    } finally {
      element.disabled = false;
      element.innerHTML = label;
    }
  },
  'sync-family-header': async () => {
    try {
      let result = await Cloud.syncNow();
      if (result?.local) {
        const connected = await Cloud.connect(Cloud.getConfig());
        if (connected?.ok) result = await Cloud.syncNow();
        else result = connected;
      }
      if (result?.ok) {
        ui.appMounted = false;
        renderApplication();
        toast('Sinkronisasi cloud selesai.', 'success');
      } else if (result?.local) {
        toast('Sinkronisasi cloud belum diaktifkan.', 'info');
      } else {
        toast(
          result?.error?.message || 'Gagal menyinkronkan ke cloud.',
          'error',
        );
      }
    } catch (error) {
      toast(error.message || 'Gagal menyinkronkan ke cloud.', 'error');
    } finally {
      // element disabled handling done in caller
    }
  },
  'offline-open': () => {
    const opened = store.openLastWorkspace();
    if (!opened) {
      toast('Data terakhir tidak ditemukan. Masuk dengan Google.', 'info');
      return;
    }
    if (opened.hasPin) {
      ui.locked = true;
      ui.currentUser = opened.user;
      renderAuth();
    } else {
      enterApplication(opened.user);
    }
  },
  'switch-account': () => {
    clearSession();
    store.setCurrentUser(null);
    ui.currentUser = null;
    ui.locked = false;
    ui.appMounted = false;
    closeModal({ silent: true });
    renderAuth();
  },
  'google-restore': async (element) => {
    const label = element.innerHTML;
    element.disabled = true;
    element.textContent = 'Menghubungkan…';
    try {
      const account = await signInWithGoogleFlow();
      if (!store.hasWorkspace) await store.signInWithGoogle(account);
      await openDriveRestoreModal();
    } catch (error) {
      console.error(error);
      toast(
        error.message || 'Gagal memulihkan dari Google Drive.',
        'error',
      );
    } finally {
      element.disabled = false;
      element.innerHTML = label;
    }
  },
  'gdrive-signout': async () => {
    const ok = await confirmDialog({
      title: 'Putuskan Google?',
      message:
        'Backup Drive berhenti di perangkat ini. Data lokal tetap aman.',
      confirmLabel: 'Putuskan',
    });
    if (!ok) return;
    await GoogleDrive.signOut();
    refreshDriveUi();
    toast('Akun Google diputuskan.', 'success');
    if (store.currentUser) {
      ui.appMounted = false;
      renderApplication();
    } else {
      renderAuth();
    }
  },
  'drive-backup': async () => {
    await driveBackupNow();
  },
  'drive-restore': async () => {
    await openDriveRestoreModal();
  },
  'drive-restore-file': async (element) => {
    const id = element.dataset.id;
    await driveRestoreFile(id);
  },
  'cloud-test': async (element) => {
    const form = element.closest('form[data-form="cloud"]');
    if (form) await testCloudFromForm(form);
  },
  'create-jsonbin': async (element) => {
    const form = element.closest('form[data-form="cloud"]');
    if (form) await createJsonBinFromForm(form);
  },
  'cloud-provider-change': (element) => {
    const form = element.closest('form');
    const provider = element.value;
    form
      ?.querySelectorAll('[data-provider-section]')
      .forEach((section) => {
        section.hidden = section.dataset.providerSection !== provider;
      });
    const help =
      form?.querySelector('[data-cloud-help], #cloud-provider-help');
    if (help)
      help.textContent =
        CLOUD_PROVIDERS[provider]?.description || '';
  },
};
