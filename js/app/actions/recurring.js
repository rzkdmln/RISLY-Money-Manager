/**
 * RISLY — Recurring Actions.
 * Domain: recurring
 */

import { openRecurringModal } from '../modals.js';
import { store } from '../../store.js';
import { runRecurring, renderApplication } from '../../app.js';
import { closeModal, toast } from '../../ui.js';
import { todayISO } from '../../utils.js';

export const recurringActions = {
  'add-rec': () => {
    closeModal({ silent: true });
    openRecurringModal();
  },
  'edit-rec': (element) => {
    const id = element.dataset.id;
    const rule = store.recurringById(id);
    if (!rule) return;
    closeModal({ silent: true });
    openRecurringModal(rule);
  },
  'toggle-rec': (element) => {
    const id = element.dataset.id;
    const rule = store.recurringById(id);
    if (!rule) return;
    store.setRecurringActive(id, !rule.active);
    toast(rule.active ? 'Jadwal dijeda.' : 'Jadwal diaktifkan.', 'success');
  },
  'post-rec': async (element) => {
    const id = element.dataset.id;
    const rule = store.recurringById(id);
    if (!rule) return;
    const posted = store.postRecurringNow(id);
    toast(
      posted
        ? 'Transaksi berulang berhasil diposting.'
        : 'Transaksi untuk tanggal ini sudah ada.',
      posted ? 'success' : 'info',
    );
    renderApplication();
  },
  'process-recurring': () => {
    const result = runRecurring({ notify: false });
    toast(
      result.posted
        ? `${result.posted} transaksi berulang diproses.`
        : 'Tidak ada jadwal yang perlu diproses.',
      result.posted ? 'success' : 'info',
    );
    renderApplication();
  },
  'rec-form-type': (element) => {
    const form = element.closest('form[data-form="recurring"]');
    if (!form) return;
    const fd = new FormData(form);
    const editingId = form.dataset.id;
    const original = editingId ? store.recurringById(editingId) : null;
    const values = {
      type: element.dataset.type,
      title: fd.get('title') || '',
      amount: fd.get('amount') || '',
      nextDate: fd.get('nextDate') || todayISO(),
      accountId: fd.get('accountId') || '',
      toAccountId: fd.get('toAccountId') || '',
      categoryId: fd.get('categoryId') || '',
      subcategoryId: fd.get('subcategoryId') || '',
      frequency: fd.get('frequency') || 'monthly',
      interval: fd.get('interval') || 1,
      endDate: fd.get('endDate') || '',
      note: fd.get('note') || '',
    };
    closeModal({ silent: true });
    if (original)
      openRecurringModal({ ...original, ...values }, values);
    else openRecurringModal(null, values);
  },
};
