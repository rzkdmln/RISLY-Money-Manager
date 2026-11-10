/**
 * RISLY Money Manager — Split payment helpers.
 */

import { paymentRowHint, paymentRowHtml } from '../forms/transaction.js';
import { expressionResult, formatCurrency } from '../core/utils.js';

function refreshPaymentRowHint(row) {
  const hint = row?.querySelector('[data-payment-hint]');
  if (!hint) return;
  hint.textContent = paymentRowHint(row.querySelector('[name="paymentAccount"]')?.value || '');
}

function createPaymentRow(payment = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = paymentRowHtml(payment).trim();
  return wrapper.firstElementChild;
}

function addPaymentRow(trigger) {
  const form = trigger?.closest('form[data-form="transaction"]');
  const container = form?.querySelector('[data-payment-rows]');
  if (!container) return;
  const row = createPaymentRow({});
  container.appendChild(row);
  syncPaymentSplit(form);
  row.querySelector('[name="paymentAccount"]')?.focus({ preventScroll: true });
}

function syncPaymentSplit(form) {
  if (!form) return null;
  const toggle = form.querySelector('[data-toggle-payment-split]');
  const enabled = Boolean(toggle?.checked);
  const section = form.querySelector('.payment-split-section');
  if (section) section.hidden = !enabled;
  const singleAccount = form.querySelector('[data-single-account]');
  if (singleAccount) singleAccount.classList.toggle('hidden', enabled);

  const rows = [...form.querySelectorAll('[data-payment-row]')];
  const amountInput = form.querySelector('[name="amountExpression"]');
  const totalRaw = expressionResult(amountInput?.value);
  const total = totalRaw === null ? 0 : Math.round(totalRaw);
  let allocated = 0;
  let missingAccount = false;
  let missingAmount = false;

  rows.forEach((row) => {
    refreshPaymentRowHint(row);
    const accountValue = row.querySelector('[name="paymentAccount"]')?.value || '';
    const amount = Math.round(Number(row.querySelector('[name="paymentAmount"]')?.value || 0));
    if (!accountValue) missingAccount = true;
    if (!(amount > 0)) missingAmount = true;
    if (Number.isFinite(amount) && amount > 0) allocated += amount;
    const removeButton = row.querySelector('[data-action="remove-payment"]');
    if (removeButton) removeButton.disabled = rows.length <= 2;
  });

  const remaining = total - allocated;
  const totalNode = form.querySelector('[data-payment-total]');
  const allocatedNode = form.querySelector('[data-payment-allocated]');
  const remainingNode = form.querySelector('[data-payment-remaining]');
  const statusNode = form.querySelector('[data-payment-status]');
  if (totalNode) totalNode.textContent = total > 0 ? formatCurrency(total, { hide: false }) : '—';
  if (allocatedNode) allocatedNode.textContent = formatCurrency(allocated, { hide: false });
  if (remainingNode) {
    remainingNode.textContent = formatCurrency(remaining, { hide: false });
    remainingNode.classList.toggle('is-negative', remaining < 0);
    remainingNode.classList.toggle('is-positive', remaining > 0);
  }

  const valid = enabled && total > 0 && allocated === total && !missingAccount && !missingAmount;
  if (statusNode) {
    if (!enabled) {
      statusNode.textContent = '';
    } else if (total <= 0) {
      statusNode.textContent = 'Isi nominal transaksi terlebih dahulu.';
    } else if (missingAccount) {
      statusNode.textContent = 'Pilih akun untuk setiap baris pembayaran.';
    } else if (missingAmount) {
      statusNode.textContent = 'Isi nominal lebih dari nol untuk setiap akun.';
    } else if (remaining > 0) {
      statusNode.textContent = `Kurang ${formatCurrency(remaining, { hide: false })} dari total transaksi.`;
    } else if (remaining < 0) {
      statusNode.textContent = `Kelebihan ${formatCurrency(Math.abs(remaining), { hide: false })} dari total transaksi.`;
    } else {
      statusNode.textContent = 'Total pembayaran sudah sesuai.';
    }
    statusNode.classList.toggle('is-valid', valid);
    statusNode.classList.toggle('is-invalid', enabled && total > 0 && !valid);
  }

  const firstAccount = rows
    .map((row) => row.querySelector('[name="paymentAccount"]')?.value || '')
    .find(Boolean) || '';
  const accountSelect = form.querySelector('select[name="accountId"]');
  if (enabled && accountSelect && firstAccount) accountSelect.value = firstAccount;

  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    if (enabled) {
      submit.disabled = !valid;
      submit.classList.toggle('is-disabled', !valid);
    } else {
      submit.disabled = false;
      submit.classList.remove('is-disabled');
    }
  }
  return { total, allocated, remaining, valid };
}

export { refreshPaymentRowHint, createPaymentRow, addPaymentRow, syncPaymentSplit };
