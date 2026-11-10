/**
 * RISLY — Recurring Submissions.
 * Domain: recurring
 */

import { showFormError } from '../../ui.js';
import { formValue, stringValue, todayISO } from '../../utils.js';
import { store } from '../../store.js';
import { ui, closeModal, toast } from '../../ui.js';
import { renderApplication } from '../runtime.js';

export const recurringSubmissions = {
  recurring: (form) => {
    const fd = new FormData(form);
    const type = String(fd.get('type') || 'expense');
    const title = String(fd.get('title') || '').trim();
    const amount = Number(fd.get('amount'));
    const nextDate = String(fd.get('nextDate') || '');
    const accountId = String(fd.get('accountId') || '');
    const toAccountId = String(fd.get('toAccountId') || '');
    const categoryId = String(fd.get('categoryId') || '');
    const endDate = String(fd.get('endDate') || '');

    if (!title) {
      showFormError(form, 'Nama jadwal wajib diisi.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showFormError(form, 'Nominal jadwal harus lebih dari nol.');
      return;
    }
    if (!nextDate) {
      showFormError(form, 'Tanggal jatuh tempo berikutnya wajib diisi.');
      return;
    }
    if (!accountId) {
      showFormError(form, 'Pilih akun untuk jadwal ini.');
      return;
    }
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      showFormError(form, 'Pilih akun tujuan transfer yang berbeda.');
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      showFormError(form, 'Pilih kategori jadwal.');
      return;
    }
    if (endDate && endDate < nextDate) {
      showFormError(form, 'Tanggal berakhir tidak boleh sebelum jatuh tempo berikutnya.');
      return;
    }

    try {
      store.saveRecurring(
        {
          title,
          type,
          amount: Math.round(amount),
          nextDate,
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          categoryId: type === 'transfer' ? null : categoryId,
          subcategoryId:
            type === 'transfer'
              ? null
              : String(fd.get('subcategoryId') || '') || null,
          frequency: String(fd.get('frequency') || 'monthly'),
          interval: Math.max(1, Number(fd.get('interval')) || 1),
          endDate: endDate || null,
          note: String(fd.get('note') || '').trim(),
          autoPost: Boolean(fd.get('autoPost')),
          active: Boolean(fd.get('active')),
        },
        form.dataset.id || null,
      );
      closeModal({ silent: true });
      toast('Jadwal berulang disimpan.', 'success');
      renderApplication();
    } catch (error) {
      showFormError(form, error.message || 'Gagal menyimpan jadwal.');
    }
  },
};
