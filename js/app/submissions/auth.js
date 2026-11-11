/**
 * RISLY — Auth Submissions.
 * Domain: auth
 */

import { showFormError } from '../../ui/ui.js';
import { formValue, stringValue } from '../../core/utils.js';
import { renderAuth } from '../runtime.js';
import { enterApplication } from '../session.js';
import { store } from '../../core/store.js';
import {
  verifyPin,
  verifyPinByVerifier,
  resetFailedAttempts,
  registerFailedAttempt,
  getLockRemaining,
  createPinAndEncryption,
} from '../../core/auth.js';
import { ui, toast } from '../../ui/ui.js';

export const authSubmissions = {
  login: async (form) => {
    const userId = String(formValue(form, 'user') || ui.selectedUser || '');
    const pin = String(formValue(form, 'pin') || '');
    const user = store.getUser(userId);
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
        // Jika workspace terenkripsi, unlock untuk mendekripsi data ke memori.
        if (store.encryptionEnabled || (user.pinHash && store._encrypted === false && user.pinSalt)) {
          try {
            await store.unlock(pin);
          } catch (unlockError) {
            showFormError(form, unlockError.message || 'Gagal membuka enkripsi data.');
            return;
          }
        }
        await enterApplication(user);
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
    try {
      const credentials = await changePin(user, currentPin, newPin);
      // Buat verifier baru untuk metadata PIN (untuk unlock sebelum dekripsi).
      const { encryption } = await import('../../core/crypto.js').then((m) =>
        m.createEncryptionCredentials(newPin)
      );
      // Simpan ke user profile + metadata terpisah.
      await store.updateUser(user.id, {
        pinHash: credentials.pinHash,
        pinSalt: credentials.pinSalt,
        pinIterations: credentials.pinIterations,
        pinVerifier: encryption.verifier,
      });
      // Ganti kunci enkripsi di memori dengan kunci baru (jika saat ini unlock).
      if (store.isUnlocked) {
        import('../../core/crypto.js').then(({ deriveEncryptionKey }) => {
          return deriveEncryptionKey(newPin, credentials.pinSalt, credentials.pinIterations);
        }).then((newKey) => {
          store.setEncryptionKey(newKey, credentials.pinSalt);
        }).catch(() => {});
      }
      toast('PIN berhasil diubah. Data telah di-re-enkripsi dengan PIN baru.', 'success');
    } catch (error) {
      showFormError(form, error.message || 'Gagal mengubah PIN.');
    } finally {
      if (submit) submit.disabled = false;
    }
  },

  'setup-pin': async (form) => {
    const userId = String(formValue(form, 'user') || '');
    const pin = String(formValue(form, 'pin') || '');
    const confirmPin = String(formValue(form, 'confirmPin') || '');
    const user = store.getUser(userId) || store.currentUser;
    if (!user) return;
    if (pin !== confirmPin) {
      showFormError(form, 'PIN dan konfirmasi tidak sama.');
      return;
    }
    if (!/^\d{6,8}$/.test(pin)) {
      showFormError(form, 'PIN harus 6–8 angka.');
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const { pinCredentials, encryption } = await createPinAndEncryption(pin, user.id);
      await store.updateUser(user.id, {
        pinHash: pinCredentials.pinHash,
        pinSalt: pinCredentials.pinSalt,
        pinIterations: pinCredentials.pinIterations,
        pinVerifier: encryption.verifier,
      });
      // Set kunci enkripsi di memori agar data segera di-enkripsi saat persist.
      store.setEncryptionKey(encryption.key, pinCredentials.pinSalt);
      store._encrypted = true;
      toast('PIN dibuat. Data lokal sekarang di-enkripsi at-rest.', 'success');
      await enterApplication(user);
    } catch (error) {
      showFormError(form, error.message || 'Gagal membuat PIN.');
    } finally {
      if (submit) submit.disabled = false;
    }
  },
};
