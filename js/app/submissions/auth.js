/**
 * RISLY — Auth Submissions.
 * Domain: auth
 */

import { showFormError } from '../../ui/ui.js';
import { formValue, stringValue } from '../../core/utils.js';
import { renderAuth, renderApplication, holdRenders } from '../runtime.js';
import { enterApplication } from '../session.js';
import { store } from '../../core/store.js';
import {
  verifyPin,
  verifyPinByVerifier,
  resetFailedAttempts,
  registerFailedAttempt,
  getLockRemaining,
  changePin,
  saveLockSnapshot,
} from '../../core/auth.js';
import { ui, toast, closeModal } from '../../ui/ui.js';

export const authSubmissions = {
  login: async (form) => {
    const userId = String(
      formValue(form, 'user') || ui.selectedUser || ui.currentUser?.id || ''
    );
    const pin = String(formValue(form, 'pin') || '');
    // Snapshot layar kunci dipakai saat workspace terenkripsi belum didekripsi.
    const user =
      store.getUser(userId) || (ui.currentUser?.id === userId ? ui.currentUser : null);
    if (!user?.pinHash && !user?.pinVerifier) {
      renderAuth();
      return;
    }
    const lockRemaining = getLockRemaining(user.id);
    if (lockRemaining > 0) {
      showFormError(
        form,
        `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(
          lockRemaining / 1000,
        )} detik.`,
      );
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      // Verifikasi PIN via verifier (tidak membuka kunci enkripsi),
      // fallback ke pinHash untuk kompatibilitas versi lama.
      let valid = false;
      if (user.pinVerifier && user.pinSalt) {
        valid = await verifyPinByVerifier(user, pin);
      }
      if (!valid) {
        valid = await verifyPin(user, pin);
      }
      if (valid) {
        resetFailedAttempts(user.id);
        // Jika pengguna punya PIN atau workspace terenkripsi, unlock untuk
        // memverifikasi ulang dan mendekripsi data ke memori.
        if (store.encryptionEnabled || user.pinHash || user.pinVerifier) {
          try {
            await store.unlock(pin, user);
          } catch (unlockError) {
            showFormError(form, unlockError.message || 'Gagal membuka enkripsi data.');
            return;
          }
        }
        await enterApplication(store.getUser(user.id) || user);
        return;
      }
      const result = registerFailedAttempt(user.id);
      if (result.remaining > 0) {
        showFormError(
          form,
          `PIN salah. Coba lagi dalam ${Math.ceil(
            result.remaining / 1000,
          )} detik.`,
        );
        ui.selectedUser = user.id;
        setTimeout(() => {
          if (!store.currentUser) renderAuth();
        }, 1_000);
      } else {
        showFormError(
          form,
          `PIN salah. Sisa ${result.attemptsLeft} percobaan sebelum terkunci.`,
        );
        const input = form.querySelector('[name="pin"]');
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    } catch (error) {
      showFormError(form, error.message || 'PIN tidak valid.');
    } finally {
      if (submit) submit.disabled = false;
    }
  },
  'change-pin': async (form) => {
    const user = store.getUser(form.dataset.user) || store.currentUser;
    if (!user) return;
    const hadPin = Boolean(user.pinHash || user.pinVerifier);
    const currentPin = String(formValue(form, 'currentPin') || '');
    const newPin = String(formValue(form, 'newPin') || '');
    const confirmPin = String(formValue(form, 'confirmPin') || '');
    if (newPin !== confirmPin) {
      showFormError(form, 'PIN baru dan ulangannya tidak sama.');
      return;
    }
    if (!/^\d{6,8}$/.test(newPin)) {
      showFormError(form, 'PIN baru harus 6–8 angka.');
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    const releaseRenderHold = holdRenders();
    let saved = false;
    try {
      const credentials = await changePin(user, currentPin, newPin);
      // Simpan kredensial PIN + verifier (salt yang sama) ke profil pengguna.
      await store.updateUser(user.id, {
        pinHash: credentials.pinHash,
        pinSalt: credentials.pinSalt,
        pinIterations: credentials.pinIterations,
        pinVerifier: credentials.encryption.verifier,
      });
      // Aktifkan kunci enkripsi baru (berlaku untuk buat PIN maupun ganti PIN)
      // lalu tulis ulang data agar terenkripsi dengan PIN baru.
      if (credentials.encryption?.key) {
        store.setEncryptionKey(credentials.encryption.key, credentials.pinSalt);
        await store.persist();
      }
      // PIN pertama kali dibuat: jangan aktifkan kunci otomatis bawaan lama.
      // Pengguna memilih sendiri setelah PIN ada.
      if (!hadPin) {
        await store.updateSettings({ autoLockMinutes: 0 });
      }
      saveLockSnapshot(store.currentUser || user, store.workspaceId);
      saved = true;
    } catch (error) {
      showFormError(form, error.message || 'Gagal menyimpan PIN.');
    } finally {
      releaseRenderHold();
      if (submit) submit.disabled = false;
    }
    if (!saved) return;
    closeModal({ silent: true });
    renderApplication();
    toast(
      hadPin
        ? 'PIN berhasil diubah. Data telah di-re-enkripsi dengan PIN baru.'
        : 'PIN berhasil dibuat. Data lokal sekarang dienkripsi.',
      'success'
    );
  },
};
