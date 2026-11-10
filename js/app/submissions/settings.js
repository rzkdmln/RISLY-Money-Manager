/**
 * RISLY — Settings Submissions.
 * Domain: settings
 */

import {
  closeModal,
  toast,
} from '../../ui.js';
import { renderApplication } from '../../app.js';
import { store } from '../../store.js';

export const settingsSubmissions = {
  'auto-lock': (form) => {
    const value = Number(form.querySelector('[name="autoLockMinutes"]')?.value || 0);
    store.updateSettings({ autoLockMinutes: Number.isFinite(value) ? value : 0 });
    closeModal();
    renderApplication();
    toast('Pengaturan sesi disimpan.', 'success');
  },
  'week-start': (form) => {
    const value = Number(form.querySelector('[name="weekStartsOn"]')?.value || 1);
    store.updateSettings({ weekStartsOn: Number.isFinite(value) ? value : 1 });
    closeModal();
    renderApplication();
    toast('Pengaturan kalender disimpan.', 'success');
  },
};
