/**
 * RISLY — Export & Data Actions.
 * Domain: exports
 */

import { openExportModal } from '../../services/export.js';
import { addPaymentRow, syncPaymentSplit } from '../payment-split.js';
import { openReceiptLightbox } from '../modals.js';
import {
  openImportFormModal,
  openImportFilePicker,
  downloadImportTemplate,
} from '../../services/import.js';
import {
  exportExcel,
  exportExcelRange,
  exportPdf,
  exportPdfRange,
} from '../../services/export.js';
import {
  backupNow,
  pickBackupFile,
  resetApplication,
} from '../../backup.js';
import { monthKey, shiftMonthKey, formatMonth, escapeHTML } from '../../utils.js';
import { ui } from '../../ui.js';
import { store } from '../../store.js';
import { closeModal, confirmDialog, toast } from '../../ui.js';
import { renderApplication } from '../runtime.js';

export const exportActions = {
  'open-export-modal': () => {
    openExportModal();
  },
  'add-payment': (element) => {
    addPaymentRow(element);
  },
  'remove-payment': async (element) => {
    const form = element.closest('form');
    const rows = form?.querySelectorAll('[data-payment-row]') || [];
    if (rows.length <= 2) {
      toast('Split pembayaran membutuhkan minimal dua akun.', 'info');
      return;
    }
    element.closest('[data-payment-row]')?.remove();
    syncPaymentSplit(form);
  },
  'choose-receipt': (element) => {
    const form = element.closest('form');
    form?.querySelector('input[data-receipt-file]')?.click();
  },
  'remove-receipt': (element) => {
    const form = element.closest('form');
    const hidden = form?.querySelector('input[name="receipt"]');
    const wrap = form?.querySelector('[data-receipt-wrap]');
    const preview = form?.querySelector('[data-receipt-preview]');
    const file = form?.querySelector('input[data-receipt-file]');
    const uploadWrap = form?.querySelector('[data-receipt-upload]');
    const fileName = form?.querySelector('[data-receipt-name]');
    if (hidden) hidden.value = '';
    if (preview) preview.removeAttribute('src');
    if (wrap) wrap.classList.add('hidden');
    if (file) file.value = '';
    if (uploadWrap) uploadWrap.classList.remove('hidden');
    if (fileName) fileName.textContent = 'Struk terlampir';
  },
  'view-receipt': (element) => {
    const form = element.closest('form');
    const receipt =
      form?.querySelector('input[name="receipt"]')?.value ||
      element
        ?.closest('[data-receipt-wrap]')
        ?.querySelector('img')?.src;
    if (!receipt) return;
    openReceiptLightbox(receipt);
  },
  'import-transactions': () => {
    openImportFormModal();
  },
  'download-template-csv': () => {
    downloadImportTemplate('csv');
  },
  'download-template-xlsx': () => {
    downloadImportTemplate('xlsx');
  },
  'choose-import-file': () => {
    closeModal({ silent: true });
    openImportFilePicker();
  },
  'export-xlsx-all': () => {
    exportExcel(null);
  },
  'export-xlsx-month': () => {
    exportExcel(ui.reportMonth || monthKey());
  },
  'export-pdf': () => {
    exportPdf(ui.reportMonth || monthKey());
  },
  'export-xlsx-range': () => {
    exportExcelRange(ui.reportRangeStart, ui.reportRangeEnd);
  },
  'export-pdf-range': () => {
    exportPdfRange(ui.reportRangeStart, ui.reportRangeEnd);
  },
  'export-backup': () => {
    backupNow();
  },
  'close-month': async () => {
    const month = ui.reportMonth || monthKey();
    const ok = await confirmDialog({
      title: 'Tutup buku bulan ini?',
      message:
        'Bulan ' +
        escapeHTML(formatMonth(month)) +
        ' akan dikunci. Transaksi dan anggaran bulan ini tidak dapat diubah hingga buku dibuka kembali.',
      confirmLabel: 'Tutup buku',
      cancelLabel: 'Batal',
      danger: false,
      iconName: 'lock',
    });
    if (!ok) return;
    store.lockMonth(month, 'Penutupan buku bulanan');
    renderApplication();
    toast('Buku bulan ' + escapeHTML(formatMonth(month)) + ' ditutup.', 'success');
  },
  'reopen-month': async () => {
    const month = ui.reportMonth || monthKey();
    const ok = await confirmDialog({
      title: 'Buka kembali buku?',
      message:
        'Bulan ' +
        escapeHTML(formatMonth(month)) +
        ' akan dibuka kembali sehingga transaksi dapat diubah lagi.',
      confirmLabel: 'Buka kembali',
      cancelLabel: 'Batal',
      danger: false,
      iconName: 'unlock',
    });
    if (!ok) return;
    store.unlockMonth(month);
    renderApplication();
    toast('Buku bulan ' + escapeHTML(formatMonth(month)) + ' dibuka kembali.', 'info');
  },
  'carry-budget': async () => {
    const from = shiftMonthKey(ui.budgetMonth || monthKey(), -1);
    const to = ui.budgetMonth || monthKey();
    const ok = await confirmDialog({
      title: 'Salin anggaran dari ' + escapeHTML(formatMonth(from)) + '?',
      message:
        'Batas anggaran per kategori akan disalin ke bulan ' +
        escapeHTML(formatMonth(to)) +
        '. Anggaran yang sudah ada di bulan tujuan akan ditimpa.',
      confirmLabel: 'Salin',
      cancelLabel: 'Batal',
      danger: false,
      iconName: 'copy',
    });
    if (!ok) return;
    const result = store.carryBudgets(from, to);
    if (result.carried === 0) {
      toast('Bulan asal belum memiliki anggaran.', 'info');
      return;
    }
    toast(
      'Anggaran dari ' +
        escapeHTML(formatMonth(from)) +
        ' telah disalin (' +
        result.carried +
        ' kategori).',
      'success',
    );
    renderApplication();
  },
  'loan-schedule': (element) => {
    openLoanScheduleModal(element.dataset.id);
  },
  'import-backup': () => {
    pickBackupFile();
  },
  'load-sample': async () => {
    await loadSampleData();
  },
  'reset-app': async () => {
    await resetApplication();
  },
};
