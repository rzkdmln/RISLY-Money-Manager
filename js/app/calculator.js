/**
 * RISLY Money Manager — Calculator & date input helpers.
 */

import { expressionResult, formatAmountExpression, formatCurrency, parseDateDMY } from '../utils.js';
import { toast, ui } from '../ui.js';
import { syncPaymentSplit } from './payment-split.js';

function updateCalculator(form) {
  if (!form) return;
  const input = form.querySelector('[name="amountExpression"]');
  const resultNode = form.querySelector('#tx-amount-result');
  if (!input || !resultNode) return;
  const value = expressionResult(input.value);
  if (value === null) {
    resultNode.textContent = input.value.trim() ? 'Ekspresi belum valid' : 'Masukkan nominal';
    resultNode.classList.add('text-slate-400');
    resultNode.classList.remove('text-slate-900', 'dark:text-white');
  } else {
    resultNode.textContent = formatCurrency(Math.round(value), { hide: false });
    resultNode.classList.remove('text-slate-400');
    resultNode.classList.add('text-slate-900', 'dark:text-white');
  }
}

function formatCalculatorInput(input) {
  const raw = input.value;
  if (!raw) return;
  const caret = input.selectionStart ?? raw.length;
  const meaningful = raw.slice(0, caret).replace(/[^\d,+×÷−]/g, '').length;
  const formatted = formatAmountExpression(raw);
  if (formatted === raw) return;
  input.value = formatted;
  let position = 0;
  let seen = 0;
  while (position < formatted.length && seen < meaningful) {
    if (/[\d,+×÷−]/.test(formatted[position])) seen += 1;
    position += 1;
  }
  try { input.setSelectionRange(position, position); } catch { /* noop */ }
}

function maskDateInput(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  let display = digits.slice(0, 2);
  if (digits.length > 2) display += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) display += `/${digits.slice(4, 8)}`;
  input.value = display;
  const form = input.closest('form');
  const hidden = form?.querySelector('input[name="date"][type="date"]');
  if (hidden) hidden.value = parseDateDMY(display) || '';
}

function toggleCalculator(button) {
  const form = button.closest('form');
  const panel = form?.querySelector('[data-calc-keypad]');
  if (!panel) return;
  const open = panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden', !open);
  button.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Sembunyikan kalkulator' : 'Tampilkan kalkulator');
  ui.calcOpen = open;
  if (open) {
    const input = form.querySelector('[name="amountExpression"]');
    input?.focus({ preventScroll: true });
  }
}

function handleCalculatorKey(button) {
  const form = button.closest('form');
  const input = form?.querySelector('[name="amountExpression"]');
  if (!input) return;
  const key = button.dataset.calcKey;
  let value = input.value;

  if (key === 'clear') {
    value = '';
  } else if (key === '=') {
    const result = expressionResult(value);
    if (result === null) {
      toast('Ekspresi belum valid.', 'error');
      input.focus();
      return;
    }
    value = String(Math.round(result * 100) / 100).replace('.', ',');
  } else if (key === ',') {
    const segment = value.split(/[+−×÷]/).pop();
    if (!segment) value += '0,';
    else if (!segment.includes(',')) value += ',';
  } else if (['+', '−', '×', '÷'].includes(key)) {
    if (!value) value = '0';
    if (/[+−×÷]$/.test(value)) value = value.slice(0, -1);
    if (value.endsWith(',')) value = value.slice(0, -1);
    value += key;
  } else {
    value += key;
  }

  input.value = formatAmountExpression(value);
  updateCalculator(form);
  syncPaymentSplit(form);
  input.focus({ preventScroll: true });
  try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* noop */ }
}

export { updateCalculator, formatCalculatorInput, maskDateInput, toggleCalculator, handleCalculatorKey };
