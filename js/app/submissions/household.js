/**
 * RISLY — Household Submissions.
 * Domain: household
 */

import { showFormError } from '../../ui/ui.js';
import { stringValue, formValue } from '../../core/utils.js';
import { store } from '../../core/store.js';
import { Cloud } from '../../services/cloud.js';
import { ui, toast } from '../../ui/ui.js';
import { renderApplication } from '../runtime.js';

export const householdSubmissions = {
  'settings-household': (form) => {
    const householdName = stringValue(form, 'householdName');
    if (!householdName) {
      showFormError(form, 'Nama ruang wajib diisi.');
      return;
    }
    store.updateSettings({
      householdName,
      workspaceName: householdName,
      defaultMonthlyBudget:
        formValue(form, 'defaultMonthlyBudget') === null
          ? store.data.settings.defaultMonthlyBudget
          : Number(formValue(form, 'defaultMonthlyBudget')) || 0,
    });
    // Segarkan index kode undangan agar nama ruang terbaru ikut terlihat
    // saat anggota bergabung dari perangkat lain.
    Cloud.publishInviteCode().catch(() => {});
    toast('Identitas ruang disimpan.', 'success');
    renderApplication();
  },
};
