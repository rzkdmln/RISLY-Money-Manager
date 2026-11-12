/**
 * RISLY — Event Wiring.
 * Extracted from js/app.js section "Event wiring".
 */

import { renderApplication, debounceSearch, noteActivity, lastActivityWrite } from './runtime.js';
import { rememberFocus } from './focus.js';
import { checkAutoLock, runRecurring, checkReminders } from './session.js';
import { showFormError } from '../ui/ui.js';
import { updateSessionActivity } from '../core/auth.js';
import {
  handleCalculatorKey,
  formatCalculatorInput,
  updateCalculator,
  maskDateInput,
  openNativeDatePicker,
} from './calculator.js';
import { setColorFieldBase } from '../ui/colors.js';
import {
  syncPaymentSplit,
  createPaymentRow,
  addPaymentRow,
  refreshPaymentRowHint,
} from './payment-split.js';
import { scheduleNoteAutosave } from './note-editor.js';
import {
  expressionResult,
  formatCurrency,
  formatDateDMY,
  formatNumber,
  normalizeTime,
  currentTimeHHMM,
  debounce,
  escapeHTML,
  escapeAttr,
} from '../core/utils.js';
import { ui, closeModal, toast } from '../ui/ui.js';
import { store } from '../core/store.js';
import { repository } from '../core/repository.js';
import { uid } from '../core/utils.js';
import { Cloud } from '../services/cloud.js';
import { ROUTES } from '../core/config.js';
import { subcategoryOptions, accountOptions } from '../forms/transaction.js';
import { transactionFilterModal } from '../views/transactions.js';
import { todoItemRow } from '../forms/note.js';
import { icon } from '../ui/icons.js';
import { initStorageUsage } from '../views/settings.js';
import { resizeCharts, destroyCharts, renderDashboardCharts } from '../services/charts.js';
import { initPullToRefresh } from '../ui/pull-to-refresh.js';
import { handleAction } from './actions/index.js';
import { submitForm } from './submissions/index.js';
import { syncBudgetAllocHint } from './submissions/budget.js';

export function bindEvents() {
  document.addEventListener('click', (event) => {
    const pinKey = event.target.closest('[data-pin-key]');
    if (pinKey) {
      event.preventDefault();
      const input = document.getElementById('pin-input');
      if (!input || input.disabled) return;
      const key = pinKey.dataset.pinKey;
      if (key === 'clear') input.value = '';
      else if (key === 'back') input.value = input.value.slice(0, -1);
      else if (input.value.length < 8) input.value += key;
      input.focus();
      return;
    }

    const calcKey = event.target.closest('[data-calc-key]');
    if (calcKey) {
      event.preventDefault();
      handleCalculatorKey(calcKey);
      return;
    }

    const dateDisplay = event.target.closest('input[name="dateDisplay"]');
    if (dateDisplay) {
      openNativeDatePicker(dateDisplay.closest('.date-input-wrap'));
      return;
    }

    const actionNode = event.target.closest('[data-action]');
    if (actionNode) {
      if (['SELECT', 'INPUT', 'TEXTAREA'].includes(actionNode.tagName)) return;
      event.preventDefault();
      actionNode.classList.add('is-pressed');
      setTimeout(() => actionNode.classList.remove('is-pressed'), 140);
      Promise.resolve(handleAction(actionNode.dataset.action, actionNode)).catch((error) => {
        console.error('Action failed:', error);
        toast(error.message || 'Terjadi kesalahan.', 'error');
      });
      return;
    }

    const navLink = event.target.closest('a[href^="#/"]');
    if (navLink) closeModal({ silent: true });
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    form.querySelectorAll('[data-tag-input]').forEach((wrap) => {
      const hidden = wrap.querySelector('[data-tag-value]');
      const chips = wrap.querySelectorAll('.tag-chip');
      const values = Array.from(chips)
        .map((c) => c.dataset.tag || '')
        .filter(Boolean);
      if (hidden) hidden.value = values.join(', ');
    });
    event.preventDefault();
    Promise.resolve(submitForm(form)).catch((error) => {
      console.error('Form submission failed:', error);
      showFormError(form, error.message || 'Terjadi kesalahan saat menyimpan.');
    });
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[name="amountExpression"]')) {
      formatCalculatorInput(target);
      updateCalculator(target.closest('form'));
      syncPaymentSplit(target.closest('form'));
      return;
    }
    if (target.matches('form[data-form="recurring"] input[name="amountDisplay"]')) {
      const form = target.closest('form');
      const hidden = form.querySelector('input[name="amount"]');
      const raw = target.value.replace(/\D/g, '');
      if (hidden) hidden.value = raw || '0';
      target.value = formatNumber(raw);
      try {
        target.setSelectionRange(target.value.length, target.value.length);
      } catch { /* noop */ }
      return;
    }
    if (target.matches('form[data-form="account"] input[name$="Display"]')) {
      const form = target.closest('form');
      const hiddenName = target.name.replace(/Display$/, '');
      const hidden = form.querySelector(`input[name="${hiddenName}"]`);
      const raw = target.value.replace(/\D/g, '');
      if (hidden) hidden.value = raw || '0';
      target.value = formatNumber(raw);
      try {
        target.setSelectionRange(target.value.length, target.value.length);
      } catch { /* noop */ }
      return;
    }
    if (target.matches('[data-payment-row] [name="paymentAmount"]')) {
      syncPaymentSplit(target.closest('form'));
      return;
    }
    if (target.matches('[name="dateDisplay"]')) {
      maskDateInput(target);
      return;
    }
    if (target.id === 'tx-search') {
      ui.txQuery = target.value;
      ui.txPage = 1;
      const snapshot = rememberFocus();
      debounceSearch(() => renderApplication({ focus: snapshot }))();
      return;
    }
    if (target.id === 'notes-search') {
      ui.notesQuery = target.value;
      const snapshot = rememberFocus();
      debounceSearch(() => renderApplication({ focus: snapshot }))();
      return;
    }
    const noteForm = target.closest('form[data-form="note"][data-id]');
    if (noteForm) scheduleNoteAutosave(noteForm);
    const budgetForm = target.closest('form[data-form="budget-categories"]');
    if (
      budgetForm &&
      (target.name === 'total' || String(target.name || '').startsWith('budget_'))
    ) {
      syncBudgetAllocHint(budgetForm);
    }
  });

  document.addEventListener('keydown', (event) => {
    const field = event.target.closest('[data-tag-field]');
    if (!field) return;
    const key = event.key;
    const isSeparator = key === 'Enter' || key === ' ' || key === ',' || key === '.';
    if (!isSeparator) return;
    event.preventDefault();
    const wrap = field.closest('[data-tag-input]');
    if (!wrap) return;
    const chipsContainer = wrap.querySelector('[data-tag-chips]');
    if (!chipsContainer) return;
    const raw = field.value.trim();
    if (!raw) return;
    const tag = raw.startsWith('#') ? raw : '#' + raw;
    const exists = Array.from(chipsContainer.querySelectorAll('.tag-chip')).some(
      (c) => (c.dataset.tag || '').toLowerCase() === tag.toLowerCase()
    );
    if (exists) {
      field.value = '';
      return;
    }
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.setAttribute('role', 'listitem');
    chip.dataset.tag = tag;
    chip.innerHTML = `${escapeHTML(tag)} <button type="button" class="tag-chip-remove" data-tag-remove aria-label="Hapus tag">×</button>`;
    field.before(chip);
    field.value = '';
  });

  document.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-tag-remove]');
    if (!removeBtn) return;
    event.preventDefault();
    const chip = removeBtn.closest('.tag-chip');
    if (chip) chip.remove();
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-color-custom]')) {
      const field = target.closest('[data-color-field]');
      if (field) setColorFieldBase(field, target.value);
      return;
    }
    if (target.matches('input[name="date"][type="date"]')) {
      const form = target.closest('form');
      const display = form?.querySelector('[name="dateDisplay"]');
      if (display) display.value = target.value ? formatDateDMY(target.value) : '';
      return;
    }
    if (target.matches('select[name="paymentAccount"]')) {
      const row = target.closest('[data-payment-row]');
      refreshPaymentRowHint(row);
      syncPaymentSplit(target.closest('form'));
      return;
    }
    if (target.matches('input[data-receipt-file]')) {
      const form = target.closest('form');
      const hidden = form?.querySelector('input[name="receipt"]');
      const preview = form?.querySelector('[data-receipt-preview]');
      const wrap = form?.querySelector('[data-receipt-wrap]');
      const uploadWrap = form?.querySelector('[data-receipt-upload]');
      const fileName = form?.querySelector('[data-receipt-name]');
      const file = target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 800;
          let w = img.width,
            h = img.height;
          if (w > max || h > max) {
            if (w >= h) {
              h = Math.round(h * (max / w));
              w = max;
            } else {
              w = Math.round(w * (max / h));
              h = max;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            async (blob) => {
              if (!blob) return;
              if (blob.size > 450_000) {
                toast(
                  'Ukuran struk terlalu besar. Coba foto dengan resolusi lebih kecil.',
                  'error'
                );
                target.value = '';
                return;
              }
              const receiptId = `receipt_${uid('tx')}`;
              try {
                await repository.putReceipt(receiptId, blob, blob.type || 'image/jpeg');
                const url = URL.createObjectURL(blob);
                if (hidden) hidden.value = receiptId;
                if (preview) {
                  preview.src = url;
                  preview.classList.remove('hidden');
                }
                if (wrap) wrap.classList.remove('hidden');
                if (uploadWrap) uploadWrap.classList.add('hidden');
                if (fileName) fileName.textContent = file.name;
              } catch (error) {
                console.error('Gagal menyimpan struk:', error);
                toast('Gagal menyimpan struk. Coba lagi.', 'error');
              }
            },
            'image/jpeg',
            0.7
          );
        };
        img.src = String(reader.result || '');
      };
      reader.readAsArrayBuffer(file);
    }
    if (target.matches('select[data-account-type-select]')) {
      const form = target.closest('form[data-form="account"]');
      const fields = form?.querySelector('[data-liability-fields]');
      if (fields) fields.style.display = ['credit', 'loan'].includes(target.value) ? '' : 'none';
      return;
    }
    if (target.matches('select[name="accountOwner"]')) {
      const form = target.closest('form');
      const accountSelect = form?.querySelector('select[name="accountId"]');
      if (accountSelect) {
        const ownerId = target.value === 'all' ? null : target.value;
        const accounts = store.data.accounts
          .filter((account) => !account.deletedAt)
          .filter((account) => !ownerId || account.owner === ownerId);
        const selected = accountSelect.value;
        accountSelect.innerHTML =
          '<option value="">Pilih Akun</option>' +
          accounts
            .map(
              (account) =>
                `<option value="${escapeAttr(account.id)}" ${selected === account.id ? 'selected' : ''}>${escapeHTML(account.name)}${account.archived ? ' (arsip)' : ''}</option>`
            )
            .join('');
      }
      return;
    }
    if (target.dataset?.action) {
      Promise.resolve(handleAction(target.dataset.action, target)).catch((error) => {
        console.error('Change action failed:', error);
        toast(error.message || 'Terjadi kesalahan.', 'error');
      });
      if (target.dataset.action === 'cloud-provider-change') return;
    }
    const filter = target.dataset?.filter;
    if (filter) {
      switch (filter) {
        case 'tx-year':
          ui.txLast12 = false;
          ui.txYear = target.value || new Date().getFullYear().toString();
          ui.txPage = 1;
          break;
        case 'tx-month':
          ui.txLast12 = false;
          ui.txMonth = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'tx-type':
          ui.txType = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'tx-account':
          ui.txAccount = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'tx-category':
          ui.txCategory = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'tx-user':
          ui.txUser = target.value || 'all';
          ui.txPage = 1;
          break;
        case 'calendar-month':
          if (target.value) ui.calendarMonth = target.value;
          break;
        case 'budget-month':
          if (target.value) {
            if (target.dataset.target === 'report') ui.reportMonth = target.value;
            else ui.budgetMonth = target.value;
          }
          break;
        case 'report-month':
          if (target.value) ui.reportMonth = target.value;
          break;
        case 'report-range-start':
          if (target.value) ui.reportRangeStart = target.value;
          break;
        case 'report-range-end':
          if (target.value) ui.reportRangeEnd = target.value;
          break;
        case 'notes-sort':
          ui.notesSort = target.value || 'updated';
          break;
        default:
          break;
      }
      renderApplication();
      return;
    }

    if (target.matches('select[name="categoryId"]')) {
      const form = target.closest('form[data-form="transaction"], form[data-form="recurring"]');
      const subcategory = form?.querySelector('select[name="subcategoryId"]');
      if (subcategory) {
        subcategory.innerHTML = subcategoryOptions(target.value);
        subcategory.disabled =
          !target.value || !store.categoryById(target.value)?.subcategories?.length;
      }
      return;
    }

    if (target.matches('select[name="accountOwner"]')) {
      const form = target.closest('form[data-form="transaction"]');
      const accountSelect = form?.querySelector('select[name="accountId"]');
      if (accountSelect) {
        const selected = accountSelect.value;
        const owner = target.value || 'all';
        accountSelect.innerHTML = accountOptions(selected, null, owner, 'Pilih Akun');
        if (selected && ![...accountSelect.options].some((option) => option.value === selected)) {
          accountSelect.value = '';
        }
      }
      return;
    }

    if (target.dataset?.setting) {
      const key = target.dataset.setting;
      const value = Number(target.value);
      if (key === 'autoLockMinutes') {
        store.updateSettings({ autoLockMinutes: Number.isFinite(value) ? value : 15 });
        toast('Kunci otomatis diperbarui.', 'success');
      } else if (key === 'weekStartsOn') {
        store.updateSettings({ weekStartsOn: value === 0 ? 0 : 1 });
        toast('Awal pekan diperbarui.', 'success');
      }
      renderApplication();
      return;
    }

    if (target.matches('input[type="checkbox"]')) {
      const switchNode = target.nextElementSibling;
      if (switchNode?.classList.contains('switch')) {
        switchNode.classList.toggle('is-on', target.checked);
      }
      if (target.matches('[data-toggle-recurring]')) {
        const extra = target.closest('.option-box')?.querySelector('.recurring-extra');
        if (extra) extra.hidden = !target.checked;
      }
      if (target.matches('[data-toggle-payment-split]')) {
        const form = target.closest('form');
        const section = form?.querySelector('.payment-split-section');
        if (section) section.hidden = !target.checked;
        const singleAccount = form?.querySelector('[data-single-account]');
        if (singleAccount) singleAccount.classList.toggle('hidden', target.checked);
        if (target.checked) {
          const container = form?.querySelector('[data-payment-rows]');
          while (container && container.querySelectorAll('[data-payment-row]').length < 2) {
            container.appendChild(createPaymentRow({}));
          }
          const rows = [...(container?.querySelectorAll('[data-payment-row]') || [])];
          const hasAmount = rows.some(
            (row) => Number(row.querySelector('[name="paymentAmount"]')?.value || 0) > 0
          );
          const current = expressionResult(form.querySelector('[name="amountExpression"]')?.value);
          if (!hasAmount && current && current > 0 && rows[0]) {
            const amountInput = rows[0].querySelector('[name="paymentAmount"]');
            if (amountInput) amountInput.value = String(Math.round(current));
          }
          const accountId = form.querySelector('select[name="accountId"]')?.value;
          if (accountId && rows[0]) {
            const accountSelect = rows[0].querySelector('[name="paymentAccount"]');
            if (accountSelect && !accountSelect.value) accountSelect.value = accountId;
          }
        }
        syncPaymentSplit(form);
      }
      const noteForm = target.closest('form[data-form="note"][data-id]');
      if (noteForm) scheduleNoteAutosave(noteForm);
      return;
    }

    const noteForm2 = target.closest('form[data-form="note"][data-id]');
    if (noteForm2) scheduleNoteAutosave(noteForm2);
  });

  document.addEventListener('mousedown', (event) => {
    if (event.target.closest('.note-toolbar')) event.preventDefault();
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-nav="accounts"]');
    if (!link || !ui.accountsMember) return;
    ui.accountsMember = null;
    if (location.hash === '#/accounts') renderApplication();
  });

  window.addEventListener('hashchange', () => {
    closeModal({ silent: true });
    if (store.currentUser) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      renderApplication();
      if (location.hash === '#/settings') void initStorageUsage();
    }
  });

  window.addEventListener('pointerdown', noteActivity, { passive: true });
  window.addEventListener('keydown', noteActivity);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAutoLock();
      if (store.currentUser) {
        runRecurring({ notify: false });
        checkReminders();
      }
    }
  });

  window.addEventListener('online', () => {
    if (store.currentUser) toast('Kembali online. Sinkronisasi akan dilanjutkan.', 'info');
  });

  /* -------------------------------------------------------------------------- */
  /*  Drag & drop urutan akun                                                   */
  /* -------------------------------------------------------------------------- */

  let draggedAccountId = null;
  let dropTargetId = null;

  const sortableContainer = () => document.querySelector('[data-accounts-sortable]');

  document.addEventListener('dragstart', (event) => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle) return;
    const card = handle.closest('[data-account-id]');
    if (!card) return;
    draggedAccountId = card.dataset.accountId;
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedAccountId);
  });

  document.addEventListener('dragend', (event) => {
    const card = event.target.closest('[data-account-id]');
    if (card) card.classList.remove('is-dragging');
    draggedAccountId = null;
    dropTargetId = null;
    document.querySelectorAll('[data-account-id].is-drop-over').forEach((el) => {
      el.classList.remove('is-drop-over');
    });
  });

  document.addEventListener('dragover', (event) => {
    if (!draggedAccountId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const container = sortableContainer();
    if (!container) return;

    const card = event.target.closest('[data-account-id]');
    if (!card || !container.contains(card)) return;
    if (card.dataset.accountId === draggedAccountId) return;

    // Hapus highlight pada card sebelumnya
    document.querySelectorAll('[data-account-id].is-drop-over').forEach((el) => {
      el.classList.remove('is-drop-over');
    });

    // Tentukan posisi jatuh berdasarkan posisi mouse dalam card
    const cardRect = card.getBoundingClientRect();
    const afterY = event.clientY > cardRect.top + cardRect.height / 2;
    card.classList.add('is-drop-over');
    dropTargetId = afterY ? `after:${card.dataset.accountId}` : `before:${card.dataset.accountId}`;
  });

  document.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!draggedAccountId) return;

    const container = sortableContainer();
    if (!container) return;

    // Bangun daftar id akun saat ini, hapus yang sedang di-drag, lalu sisipkan pada posisi drop
    const cards = Array.from(container.querySelectorAll('[data-account-id]'));
    const currentIds = cards.map((el) => el.dataset.accountId);
    const nextIds = currentIds.filter((id) => id !== draggedAccountId);

    let insertIndex = nextIds.length; // default: akhir
    if (dropTargetId) {
      const [position, targetId] = dropTargetId.split(':');
      const targetIndex = nextIds.indexOf(targetId);
      if (targetIndex !== -1) {
        insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      }
    }

    nextIds.splice(insertIndex, 0, draggedAccountId);

    document.dispatchEvent(new window.CustomEvent('accounts:reorder', { detail: { ids: nextIds } }));
  });

  document.addEventListener('accounts:reorder', async (event) => {
    const { ids } = event.detail || {};
    if (!ids || !ids.length) return;
    try {
      store.reorderAccounts(ids);
      toast('Urutan akun diperbarui.', 'success');
      renderApplication();
    } catch (error) {
      toast('Gagal menyimpan urutan akun.', 'error');
    }
  });

  window.addEventListener(
    'resize',
    debounce(() => resizeCharts(), 180)
  );

  setInterval(() => {
    checkAutoLock();
    if (store.currentUser) checkReminders();
    if (store.currentUser && Cloud.canSync()) {
      Cloud.syncNow()
        .then(() => {})
        .catch(() => {});
    }
  }, 3_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.currentUser && Cloud.canSync()) {
      Cloud.syncNow()
        .then(() => {})
        .catch(() => {});
    }
  });

  // Inisialisasi kuota penyimpanan jika halaman settings aktif saat boot.
  if (location.hash === '#/settings' && store.currentUser) {
    void initStorageUsage();
  }
}

export { debounceSearch, noteActivity };
