/**
 * RISLY — Account Submissions.
 * Domain: accounts
 */

import { showFormError } from '../../ui.js';
import { stringValue } from '../../utils.js';
import { store } from '../../store.js';
import { ui, closeModal, toast } from '../../ui.js';
import { renderApplication } from '../runtime.js';

export const accountSubmissions = {
  account: (form) => {
    const fd = new FormData(form);
    const editingId = form.dataset.id || null;
    const name = String(fd.get('name') || '').trim();
    if (!name) {
      showFormError(form, 'Nama akun wajib diisi.');
      return;
    }

    let balanceTarget;
    if (editingId) {
      const rawTarget = String(fd.get('balanceTarget') ?? '').trim();
      if (rawTarget !== '') {
        const parsedTarget = Number(rawTarget);
        if (!Number.isFinite(parsedTarget)) {
          showFormError(form, 'Saldo akun harus berupa angka.');
          return;
        }
        balanceTarget = Math.round(parsedTarget);
      }
    }

    try {
      const currentBalance = editingId ? store.accountBalance(editingId) : 0;
      store.saveAccount(
        {
          name,
          type: String(fd.get('type') || 'cash'),
          color: String(fd.get('color') || '#3B82F6'),
          owner: String(fd.get('owner') || ''),
          sharedWith: fd.getAll('sharedWith').map((v) => String(v)),
          creditLimit: String(fd.get('creditLimit') || ''),
          creditDueDate: String(fd.get('creditDueDate') || ''),
          loanPrincipal: String(fd.get('loanPrincipal') || ''),
          loanInterestRate: String(fd.get('loanInterestRate') || ''),
          loanTermMonths: String(fd.get('loanTermMonths') || ''),
          loanMonthlyPayment: String(fd.get('loanMonthlyPayment') || ''),
          loanStartDate: String(fd.get('loanStartDate') || ''),
          loanNextDueDate: String(fd.get('loanNextDueDate') || ''),
          loanRemaining: String(fd.get('loanRemaining') || ''),
          ...(balanceTarget !== undefined ? { balanceTarget } : {}),
        },
        editingId,
      );
      const adjusted =
        balanceTarget !== undefined && balanceTarget !== Math.round(currentBalance);
      closeModal({ silent: true });
      toast(
        adjusted
          ? 'Akun disimpan dan penyesuaian saldo dicatat.'
          : 'Akun disimpan.',
        'success',
      );
      renderApplication();
    } catch (error) {
      showFormError(form, error.message || 'Gagal menyimpan akun.');
    }
  },
};
