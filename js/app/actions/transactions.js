/**
 * RISLY — Transaction Actions.
 * Domain: transactions
 */

import {
  openTransactionModal,
  openAccountModal,
} from '../modals.js';
import { store } from '../../store.js';
import { toggleCalculator } from '../calculator.js';
import { openNativeDatePicker, renderApplication } from '../../app.js';
import {
  expressionResult,
  formatMonth,
  parseDateDMY,
  todayISO,
  currentTimeHHMM,
  normalizeTime,
} from '../../utils.js';
import { ui, confirmDialog, closeModal, toast } from '../../ui.js';
import { transactionForm } from '../../forms/transaction.js';
import { syncPaymentSplit } from '../payment-split.js';

export const transactionActions = {
  'add-tx': (element) => {
    if (!store.activeAccounts().length) {
      toast('Tambahkan akun terlebih dahulu.', 'info');
      openAccountModal();
      return;
    }
    closeModal({ silent: true });
    openTransactionModal(null, {
      type: element.dataset.type || 'expense',
      date: element.dataset.date || todayISO(),
    });
  },
  'edit-tx': (element) => {
    const id = element.dataset.id;
    const tx = store.transactionById(id);
    if (!tx) {
      toast('Transaksi sudah tidak tersedia.', 'error');
      return;
    }
    openTransactionModal(tx);
  },
  'toggle-calc': (element) => {
    toggleCalculator(element);
  },
  'pick-date': (element) => {
    openNativeDatePicker(element.closest('.date-input-wrap'));
  },
  'delete-tx': async (element) => {
    const id = element.dataset.id;
    const tx = store.transactionById(id);
    if (!tx) return;
    if (store.isMonthLocked(tx.date.slice(0, 7))) {
      toast(
        `Bulan ${formatMonth(tx.date.slice(0, 7))} sudah ditutup. Buka buku kembali sebelum menghapus transaksi.`,
        'error',
      );
      return;
    }
    const ok = await confirmDialog({
      title: 'Hapus transaksi?',
      message:
        'Saldo akun dan laporan akan langsung disesuaikan. Transaksi yang dihapus tidak dapat dikembalikan dari aplikasi.',
    });
    if (!ok) return;
    closeModal({ silent: true });
    store.deleteTransaction(id);
    toast('Transaksi dihapus.', 'success');
    renderApplication();
  },
  'tx-form-type': (element) => {
    const form = element.closest('form[data-form="transaction"]');
    if (!form) return;
    const fd = new FormData(form);
    const editingId = form.dataset.id;
    const original = editingId ? store.transactionById(editingId) : null;
    const amount = expressionResult(fd.get('amountExpression'));
    const paymentSplit = Boolean(
      form.querySelector('[data-toggle-payment-split]')?.checked,
    );
    const payments = paymentSplit
      ? Array.from(form.querySelectorAll('[data-payment-row]'))
          .map((row) => ({
            accountId: String(
              row.querySelector('[name="paymentAccount"]')?.value || '',
            ),
            amount: Math.round(
              Number(row.querySelector('[name="paymentAmount"]')?.value || 0),
            ),
          }))
          .filter(
            (payment) => payment.accountId || payment.amount > 0,
          )
      : [];
    const values = {
      type: element.dataset.type,
      date:
        fd.get('date') ||
        parseDateDMY(fd.get('dateDisplay')) ||
        todayISO(),
      time: normalizeTime(fd.get('time'), currentTimeHHMM()),
      amount:
        amount === null ? '' : String(Math.round(amount * 100) / 100),
      accountId: fd.get('accountId') || '',
      accountOwner:
        fd.get('accountOwner') ||
        store.accountById(String(fd.get('accountId') || ''))?.owner ||
        store.currentUser?.id ||
        'all',
      toAccountId: fd.get('toAccountId') || '',
      categoryId: fd.get('categoryId') || '',
      subcategoryId: fd.get('subcategoryId') || '',
      note: fd.get('note') || '',
      payments,
      paymentSplit,
      recurring: Boolean(fd.get('makeRecurring')),
      recurringTitle: fd.get('recurringTitle') || '',
      frequency: fd.get('recurringFrequency') || 'monthly',
      calcOpen: ui.calcOpen,
    };
    const nextTx = original ? { ...original, ...values } : null;
    const nextHtml = transactionForm(nextTx, { ...values, type: values.type });
    const modalRoot = document.getElementById('modal-root');
    const panel = modalRoot?.querySelector('.modal-panel');
    if (panel) {
      panel.innerHTML = nextHtml;
      panel.classList.add('modal-in');
      syncPaymentSplit(
        panel.querySelector('form[data-form="transaction"]'),
      );
    } else {
      closeModal({ silent: true });
      openTransactionModal(nextTx, values);
    }
  },
  'delete-rec': async (element) => {
    const id = element.dataset.id;
    const rule = store.recurringById(id);
    if (!rule) return;
    const ok = await confirmDialog({
      title: 'Hapus jadwal?',
      message: `Jadwal "${rule.title}" akan dihentikan. Transaksi yang sudah terlanjur dibuat tetap tersimpan.`,
    });
    if (!ok) return;
    closeModal({ silent: true });
    store.deleteRecurring(id);
    toast('Jadwal berulang dihapus.', 'success');
    renderApplication();
  },
};
