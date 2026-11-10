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
  resetFailedAttempts,
  registerFailedAttempt,
  getLockRemaining,
} from '../../auth.js';
import { ui, toast } from '../../ui.js';

export const authSubmissions = {
  login: async (form) => {
    const userId = String(formValue(form, 'user') || ui.selectedUser || '');
    const pin = String(formValue(form, 'pin') || '');
    const user = store.getUser(userId);
    if (!user?.pinHash) {
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
      const valid = await verifyPin(user, pin);
      if (valid) {
        resetFailedAttempts(user.id);
        enterApplication(user);
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
    if (!/^\d{4,8}$/.test(newPin)) {
      showFormError(form, 'PIN baru harus 4–8 angka.');
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const credentials = await changePin(user, currentPin, newPin);
      store.updateUser(user.id, credentials);
      toast('PIN berhasil diubah. Perangkat lain akan menerima perubahan saat sinkron.', 'success');
    } catch (error) {
      showFormError(form, error.message || 'Gagal mengubah PIN.');
    } finally {
      if (submit) submit.disabled = false;
    }
  },
};
