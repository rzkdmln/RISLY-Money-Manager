/**
 * RISLY — Transaction Submissions.
 * Domain: transactions
 */

import { showFormError } from '../../ui/ui.js';
import { store } from '../../core/store.js';
import {
  expressionResult,
  parseDateDMY,
  normalizeTime,
  currentTimeHHMM,
  formatMonth,
  formatCurrency,
  safeNumber,
  advanceDate,
  todayISO,
  formValue,
  stringValue,
} from '../../core/utils.js';
import { ui, closeModal, toast } from '../../ui/ui.js';
import { renderApplication } from '../runtime.js';
import { updateSessionActivity } from '../../core/auth.js';

export const transactionSubmissions = {
  transaction: (form) => {
    const fd = new FormData(form);
    const editingId = form.dataset.id;
    const originalTransaction = editingId ? store.transactionById(editingId) : null;
    const type = String(fd.get('type') || 'expense');
    const amount = expressionResult(fd.get('amountExpression'));
    const date = String(fd.get('date') || '') || parseDateDMY(fd.get('dateDisplay'));
    const time = normalizeTime(fd.get('time'), currentTimeHHMM());
    const accountId = String(fd.get('accountId') || '');
    const toAccountId = String(fd.get('toAccountId') || '');
    const categoryId = String(fd.get('categoryId') || '');
    const subcategoryId = String(fd.get('subcategoryId') || '');

    const makePaymentSplit = fd.get('makePaymentSplit') === '1';
    const paymentRows = makePaymentSplit
      ? Array.from(form.querySelectorAll('[data-payment-row]'))
      : [];

    const payments = paymentRows
      .map((row) => {
        const paymentAccountId = String(row.querySelector('[name="paymentAccount"]')?.value || '');
        const account = store.accountById(paymentAccountId);
        return {
          accountId: paymentAccountId,
          memberId: account?.owner || null,
          amount: Math.round(Number(row.querySelector('[name="paymentAmount"]')?.value || 0)),
        };
      })
      .filter((payment) => payment.accountId || payment.amount > 0);

    let paymentTotal = 0;
    if (makePaymentSplit) {
      if (payments.length < 2) {
        showFormError(form, 'Split pembayaran membutuhkan minimal dua akun.');
        return;
      }
      if (payments.some((payment) => !payment.accountId)) {
        showFormError(form, 'Pilih akun untuk setiap baris pembayaran.');
        return;
      }
      if (payments.some((payment) => payment.amount <= 0)) {
        showFormError(form, 'Isi nominal lebih dari nol untuk setiap akun.');
        return;
      }
      const uniqueAccounts = new Set(payments.map((payment) => payment.accountId));
      if (uniqueAccounts.size !== payments.length) {
        showFormError(form, 'Setiap akun hanya boleh dipakai satu kali dalam split pembayaran.');
        return;
      }
      if (amount === null || amount <= 0) {
        showFormError(form, 'Nominal transaksi harus lebih dari nol.');
        return;
      }
      paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (paymentTotal !== Math.round(amount)) {
        showFormError(
          form,
          `Total split (${formatCurrency(paymentTotal, { hide: false })}) belum sesuai dengan nominal transaksi (${formatCurrency(Math.round(amount), { hide: false })}).`
        );
        return;
      }
    } else if (amount === null || amount <= 0) {
      showFormError(
        form,
        'Nominal harus lebih dari nol. Gunakan angka atau ekspresi seperti 250000+50000.'
      );
      return;
    }
    if (!date) {
      showFormError(form, 'Tanggal tidak valid. Gunakan format dd/mm/yyyy.');
      return;
    }
    const txMonth = String(date).slice(0, 7);
    if (store.isMonthLocked(txMonth)) {
      showFormError(
        form,
        `Bulan ${formatMonth(txMonth)} sudah ditutup. Buka buku kembali sebelum mencatat atau mengubah transaksi.`
      );
      return;
    }
    if (!time) {
      showFormError(form, 'Jam transaksi wajib diisi.');
      return;
    }
    if (!makePaymentSplit && !accountId) {
      showFormError(form, 'Pilih akun sumber dana.');
      return;
    }
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      showFormError(form, 'Pilih akun tujuan yang berbeda dari akun sumber.');
      return;
    }
    if (type !== 'transfer' && !categoryId && !originalTransaction?.adjustment) {
      showFormError(form, 'Pilih kategori transaksi.');
      return;
    }
    if (type === 'expense') {
      const checkParts = makePaymentSplit ? payments : [{ accountId, amount }];
      for (const part of checkParts) {
        const account = store.accountById(part.accountId);
        if (account?.type !== 'credit') continue;
        const creditLimit = safeNumber(account.creditLimit);
        if (!(creditLimit > 0)) continue;
        const spentSoFar = store.creditSpent(account.id);
        const remainingLimit = Math.max(0, creditLimit - spentSoFar);
        if (part.amount > remainingLimit) {
          showFormError(
            form,
            `Nominal dari akun ${account.name} melebihi sisa limit kredit (sisa ${formatCurrency(remainingLimit)}).`
          );
          return;
        }
      }
    }

    const finalAmount = Math.round(makePaymentSplit ? paymentTotal : amount);
    const originalSplits = Array.isArray(originalTransaction?.splits)
      ? originalTransaction.splits
      : [];
    const originalSplitTotal = originalSplits.reduce(
      (sum, split) => sum + (Number(split.amount) || 0),
      0
    );
    const keepLegacySplits =
      type !== 'transfer' &&
      !makePaymentSplit &&
      originalSplits.length > 0 &&
      originalSplitTotal === finalAmount &&
      (originalTransaction?.categoryId || null) === (categoryId || null);

    const receiptValue = String(fd.get('receipt') || '').trim();

    const payload = {
      date,
      time,
      type,
      amount: finalAmount,
      accountId: makePaymentSplit ? payments[0].accountId : accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId || null,
      subcategoryId: type === 'transfer' ? null : subcategoryId || null,
      note: String(fd.get('note') || '').trim(),
      payee: String(fd.get('payee') || '').trim(),
      tags: String(fd.get('tags') || '')
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 20),
      payments: makePaymentSplit ? payments : [],
      splits: keepLegacySplits ? originalSplits : [],
      receiptId: receiptValue || null,
    };

    try {
      if (editingId) {
        store.updateTransaction(editingId, payload);
        toast('Perubahan transaksi disimpan.', 'success');
      } else {
        store.addTransaction(payload);
        toast('Transaksi berhasil dicatat.', 'success');
        updateSessionActivity();
        if (fd.get('makeRecurring')) {
          const frequency = String(fd.get('recurringFrequency') || 'monthly');
          const interval = Math.max(1, Number(fd.get('recurringInterval')) || 1);
          const anchorDay = Number(date.slice(8, 10)) || 1;
          store.saveRecurring({
            title:
              String(fd.get('recurringTitle') || '').trim() || payload.note || 'Transaksi berulang',
            type,
            amount: payload.amount,
            accountId,
            toAccountId: payload.toAccountId,
            categoryId: payload.categoryId,
            subcategoryId: payload.subcategoryId,
            note: payload.note,
            frequency,
            interval,
            nextDate: advanceDate(date, frequency, interval, anchorDay),
            endDate: null,
            autoPost: true,
            active: true,
          });
          toast('Jadwal berulang ikut dibuat.', 'success');
        }
      }
      closeModal({ silent: true });
      renderApplication();
    } catch (error) {
      console.error(error);
      showFormError(form, error.message || 'Gagal menyimpan transaksi.');
    }
  },
};
