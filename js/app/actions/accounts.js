/**
 * RISLY — Account Actions.
 * Domain: accounts
 */

import { openAccountModal } from '../modals.js';
import { openModal } from '../../ui.js';
import { store } from '../../store.js';
import { ui, closeModal, confirmDialog, toast } from '../../ui.js';
import { navigate, renderApplication } from '../../app.js';
import { goalForm } from '../../views/goals.js';

export const accountActions = {
  'open-member': (element) => {
    ui.accountsMember = element.dataset.id || null;
    renderApplication();
  },
  'accounts-back': () => {
    ui.accountsMember = null;
    renderApplication();
  },
  'add-account': (element) => {
    closeModal({ silent: true });
    openAccountModal(null, element.dataset.owner || null);
  },
  'edit-account': (element) => {
    const id = element.dataset.id;
    const account = store.accountById(id);
    if (!account) return;
    closeModal({ silent: true });
    openAccountModal(account);
  },
  'archive-account': (element) => {
    const id = element.dataset.id;
    const account = store.accountById(id);
    if (!account) return;
    store.setAccountArchived(id, true);
    closeModal({ silent: true });
    toast(`Akun ${account.name} diarsipkan.`, 'success');
    renderApplication();
  },
  'delete-account': async (element) => {
    const id = element.dataset.id;
    const account = store.accountById(id);
    if (!account) return;
    const ok = await confirmDialog({
      title: 'Hapus akun?',
      message: `Akun "${account.name}" akan dihapus permanen. Transaksi lama tetap menyimpan referensi akun ini.`,
    });
    if (!ok) return;
    store.deleteAccount(id);
    toast('Akun dihapus.', 'success');
    renderApplication();
  },
  'add-goal': () => {
    closeModal({ silent: true });
    openModal({ size: 'md', className: 'form-modal', html: goalForm() });
  },
  'edit-goal': (element) => {
    const id = element.dataset.id;
    const goal = store.goalById(id);
    if (!goal) return;
    closeModal({ silent: true });
    openModal({ size: 'md', className: 'form-modal', html: goalForm(goal) });
  },
  'delete-goal': async (element) => {
    const id = element.dataset.id;
    const goal = store.goalById(id);
    if (!goal) return;
    const ok = await confirmDialog({
      title: 'Hapus target?',
      message: `Target "${goal.name}" akan dihapus.`,
    });
    if (!ok) return;
    store.deleteGoal(id);
    toast('Target dihapus.', 'success');
    renderApplication();
  },
  'restore-account': (element) => {
    const id = element.dataset.id;
    const account = store.accountById(id);
    if (!account) return;
    store.setAccountArchived(id, false);
    closeModal({ silent: true });
    toast(`Akun ${account.name} diaktifkan kembali.`, 'success');
    renderApplication();
  },
  'filter-account': (element) => {
    const id = element.dataset.id;
    ui.txAccount = id;
    ui.txLast12 = false;
    ui.txMonth = 'all';
    ui.txType = 'all';
    ui.txCategory = 'all';
    ui.txUser = 'all';
    ui.txPage = 1;
    navigate('transactions');
  },
};
