/**
 * RISLY — Budget Actions.
 * Domain: budgets
 */

import { store } from '../../store.js';
import {
  closeModal,
  confirmDialog,
  toast,
} from '../../ui.js';
import { renderApplication } from '../runtime.js';
import { shiftMonthKey, monthKey, escapeHTML, formatMonth } from '../../utils.js';

export const budgetActions = {
  'budget-prev': (element) => {
    if (element.dataset.target === 'report') {
      ui.reportMonth = shiftMonthKey(ui.reportMonth || monthKey(), -1);
    } else {
      ui.budgetMonth = shiftMonthKey(ui.budgetMonth || monthKey(), -1);
    }
    renderApplication();
  },
  'budget-next': (element) => {
    if (element.dataset.target === 'report') {
      ui.reportMonth = shiftMonthKey(ui.reportMonth || monthKey(), 1);
    } else {
      ui.budgetMonth = shiftMonthKey(ui.budgetMonth || monthKey(), 1);
    }
    renderApplication();
  },
  'copy-budget': async () => {
    const ok = await confirmDialog({
      title: 'Salin anggaran bulan lalu?',
      message:
        'Anggaran bulan ini akan ditimpa dengan anggaran bulan sebelumnya.',
      confirmLabel: 'Salin',
    });
    if (!ok) return;
    const current = ui.budgetMonth || monthKey();
    const previous = shiftMonthKey(current, -1);
    const entries = {};
    store
      .budgetStatus(previous)
      .categories.forEach((item) => {
        if (item.limit > 0) entries[item.category.id] = item.limit;
      });
    const total = store.totalBudget(previous);
    if (total > 0) entries.__total__ = total;
    if (!Object.keys(entries).length) {
      toast('Bulan sebelumnya belum memiliki anggaran.', 'info');
      return;
    }
    store.setBudgets(current, entries);
    toast('Anggaran bulan sebelumnya berhasil disalin.', 'success');
    renderApplication();
  },
};
