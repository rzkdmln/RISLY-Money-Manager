/**
 * RISLY — Transaction Filter Actions.
 * Domain: filters
 */

import { openModal } from '../../ui/ui.js';
import { transactionFilterModal } from '../../views/transactions.js';
import { ui } from '../../ui/ui.js';
import { closeModal } from '../../ui/ui.js';
import { renderApplication } from '../runtime.js';

export const filterActions = {
  'tx-open-filter': () => {
    openModal({
      size: 'md',
      className: 'form-modal',
      html: transactionFilterModal(),
    });
  },
  'apply-tx-filter': () => {
    closeModal({ silent: true });
    renderApplication();
  },
  'tx-preset-month': () => {
    ui.txLast12 = false;
    ui.txYear = String(new Date().getFullYear());
    ui.txMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    ui.txPage = 1;
    renderApplication();
  },
  'tx-preset-year': () => {
    ui.txLast12 = false;
    ui.txYear = String(new Date().getFullYear());
    ui.txMonth = 'all';
    ui.txPage = 1;
    renderApplication();
  },
  'tx-preset-recent': () => {
    ui.txLast12 = true;
    ui.txYear = 'all';
    ui.txMonth = 'all';
    ui.txPage = 1;
    renderApplication();
  },
  'tx-all-months': () => {
    ui.txLast12 = false;
    ui.txYear = 'all';
    ui.txMonth = 'all';
    ui.txPage = 1;
    renderApplication();
  },
  'reset-tx-filter': () => {
    ui.txLast12 = false;
    ui.txYear = 'all';
    ui.txMonth = 'all';
    ui.txType = 'all';
    ui.txAccount = 'all';
    ui.txCategory = 'all';
    ui.txUser = 'all';
    ui.txQuery = '';
    ui.txPage = 1;
    {
      const modal = document.querySelector('[data-tx-filter-modal]');
      if (modal) {
        modal
          .querySelectorAll('select[data-filter]')
          .forEach((select) => {
            select.value = 'all';
          });
        const search = modal.querySelector('#tx-search');
        if (search) search.value = '';
      }
    }
    renderApplication();
  },
  'tx-page': (element) => {
    ui.txPage = Math.max(1, Number(element.dataset.page) || 1);
    renderApplication();
  },
};
