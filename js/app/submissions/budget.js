/**
 * RISLY — Budget Submissions.
 * Domain: budgets
 */

import {
  showFormError,
  formValue,
} from '../../app.js';
import { store } from '../../store.js';
import { ui, toast, closeModal } from '../../ui.js';
import { renderApplication } from '../../app.js';
import { monthKey } from '../../utils.js';

export const budgetSubmissions = {
  'budget-total': (form) => {
    const amount = Number(formValue(form, 'amount')) || 0;
    store.setBudget(ui.budgetMonth || monthKey(), '__total__', amount);
    toast('Total anggaran disimpan.', 'success');
    renderApplication();
  },
  'budget-categories': (form) => {
    const entries = {};
    new FormData(form).forEach((value, key) => {
      if (key.startsWith('budget_')) entries[key.slice(7)] = Number(value) || 0;
    });
    const warning = Number(formValue(form, 'warning'));
    const danger = Number(formValue(form, 'danger'));
    const hasThresholds =
      form.querySelector('[name="warning"]') &&
      form.querySelector('[name="danger"]');
    if (hasThresholds) {
      if (
        !Number.isFinite(warning) ||
        !Number.isFinite(danger) ||
        warning < 1 ||
        danger > 100 ||
        danger <= warning
      ) {
        showFormError(
          form,
          'Ambang bahaya harus lebih besar dari peringatan (1–100%).',
        );
        return;
      }
      store.updateSettings({ budgetWarning: warning, budgetDanger: danger });
    }
    entries.__total__ = Object.keys(entries).reduce(
      (sum, key) => sum + (Number(entries[key]) || 0),
      0,
    );
    store.setBudgets(ui.budgetMonth || monthKey(), entries);
    toast('Anggaran disimpan.', 'success');
    closeModal({ silent: true });
    renderApplication();
  },
  'budget-thresholds': (form) => {
    const warning = Number(formValue(form, 'warning'));
    const danger = Number(formValue(form, 'danger'));
    if (
      !Number.isFinite(warning) ||
      !Number.isFinite(danger) ||
      warning < 1 ||
      danger > 100 ||
      danger <= warning
    ) {
      showFormError(form, 'Ambang bahaya harus lebih besar dari peringatan (1–100%).');
      return;
    }
    store.updateSettings({ budgetWarning: warning, budgetDanger: danger });
    toast('Ambang peringatan disimpan.', 'success');
    closeModal({ silent: true });
    renderApplication();
  },
  syncBudgetAllocHint: (form) => {
    if (!form) return;
    const totalInput = form.querySelector('[name="total"]');
    if (!totalInput) return;
    let allocated = 0;
    form.querySelectorAll('input[name^="budget_"]').forEach((input) => {
      allocated += Number(input.value || 0) || 0;
    });
    totalInput.value = String(Math.round(allocated));
  },
};

export function syncBudgetAllocHint(form) {
  budgetSubmissions['syncBudgetAllocHint'](form);
}
