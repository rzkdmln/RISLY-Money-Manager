/**
 * RISLY — Navigation & Sheet Actions.
 * Domain: navigation
 */

import {
  openProfileSheet,
  openGlobalSearch,
  openTransactionModal,
  openAccountModal,
  openNoteEditor,
  openAutoLockModal,
  openThemeModal,
  openWeekModal,
  openMoreSheet,
  openBudgetCategoriesModal,
  openBudgetCategoryAmountLightbox,
  openTasksSheet,
  openInstallHelp,
  openForgotPinModal,
  openAuthCloudModal,
} from '../modals.js';
import { navigate, renderApplication } from '../runtime.js';
import { lockApplication, leaveApplication } from '../session.js';
import { requestNotifications, checkForUpdate } from '../pwa.js';
import { store } from '../../core/store.js';
import { Cloud } from '../../services/cloud.js';
import {
  ui,
  prefs,
  closeModal,
  confirmDialog,
  openModal,
  savePrefs,
  setTheme,
  toast,
  togglePrivacy,
} from '../../ui/ui.js';
import { icon } from '../../ui/icons.js';
import { flushNoteAutosave } from '../note-editor.js';
import { monthKey } from '../../core/utils.js';
import { changePinForm, profileForm } from '../../forms/account.js';

export const navigationActions = {
  nav: (element) => {
    navigate(element.dataset.route || 'dashboard');
  },
  'open-profile': () => {
    openProfileSheet();
  },
  'open-global-search': () => {
    openGlobalSearch();
  },
  'global-open': (element) => {
    const kind = element.dataset.type;
    const id = element.dataset.id;
    closeModal();
    if (kind === 'tx') {
      const tx = store.transactionById(id);
      if (tx) openTransactionModal(tx);
    } else if (kind === 'account') {
      const account = store.accountById(id);
      if (account) openAccountModal(account);
    } else if (kind === 'note') {
      const note = store.noteById ? store.noteById(id) : null;
      if (note) openNoteEditor(note, note.kind || 'note');
    } else if (kind === 'category') {
      navigate('categories');
    }
  },
  'open-auto-lock': () => {
    openAutoLockModal();
  },
  'open-theme-modal': () => {
    openThemeModal();
  },
  'open-week-modal': () => {
    openWeekModal();
  },
  'open-more': () => {
    openMoreSheet();
  },
  'open-budget-categories': () => {
    openBudgetCategoriesModal();
  },
  'open-budget-category-amount': (element) => {
    const categoryId = element.dataset.categoryId;
    const categoryName = element.dataset.categoryName || '';
    const month =
      element.dataset.month || ui.budgetMonth || monthKey();
    const amount = Number(element.dataset.amount) || 0;
    openBudgetCategoryAmountLightbox(categoryId, categoryName, amount, month);
  },
  'open-tasks': () => {
    openTasksSheet();
  },
  'close-modal': () => {
    flushNoteAutosave();
    closeModal();
  },
  'reload-app': () => {
    location.reload();
  },
  'lock-app': () => {
    lockApplication();
  },
  'remove-pin': async () => {
    const user = store.currentUser;
    if (!user?.pinHash) return;
    const ok = await confirmDialog({
      title: 'Hapus PIN?',
      message:
        'Login Google tetap bisa masuk. Tanpa PIN, aplikasi tidak terkunci secara offline.',
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    store.updateUser(user.id, {
      pinHash: '',
      pinSalt: '',
      pinIterations: 0,
    });
    ui.appMounted = false;
    renderApplication();
    toast('PIN dihapus.', 'success');
  },
  'remove-member': async (element) => {
    const id = element.dataset.id;
    const member = store.getUser(id);
    if (!member) return;
    const ok = await confirmDialog({
      title: `Keluarkan ${member.name}?`,
      message:
        'Anggota ini tidak bisa masuk lagi dengan akunnya. Data yang sudah dibuat tetap tersimpan.',
      confirmLabel: 'Keluarkan',
      danger: true,
    });
    if (!ok) return;
    try {
      let cloudRemoved = true;
      if (member.firebaseUid) {
        const result = await Cloud.removeHouseholdMember(member.firebaseUid);
        cloudRemoved = Boolean(result?.ok);
      }
      store.removeMember(id);
      ui.appMounted = false;
      renderApplication();
      toast(
        cloudRemoved
          ? `${member.name} dikeluarkan.`
          : `${member.name} dikeluarkan lokal. Akses cloud dicabut saat perangkat kembali online.`,
        'success',
      );
    } catch (error) {
      toast(error.message || 'Gagal mengeluarkan anggota.', 'error');
    }
  },
  'copy-invite': async () => {
    const code = store.getWorkspaceCode();
    try {
      await navigator.clipboard.writeText(code);
      toast('Kode undangan disalin.', 'success');
    } catch {
      toast(`Kode: ${code}`, 'info');
    }
  },
  'rotate-invite': async () => {
    const ok = await confirmDialog({
      title: 'Buat kode undangan baru?',
      message:
        'Kode lama tidak bisa dipakai lagi. Bagikan kode baru ke anggota keluarga.',
      confirmLabel: 'Buat baru',
    });
    if (!ok) return;
    const code = store.rotateWorkspaceCode();
    try {
      await Cloud.publishInviteCode({ previousCode: store.getWorkspaceCode() });
    } catch {
      /* sync akan mencoba lagi */
    }
    ui.appMounted = false;
    renderApplication();
    toast(`Kode baru: ${code}`, 'success');
  },
  logout: async () => {
    const ok = await confirmDialog({
      title: 'Keluar dari sesi?',
      message:
        'Data tetap tersimpan. Anda perlu memasukkan PIN untuk masuk kembali.',
      confirmLabel: 'Keluar',
      danger: false,
      iconName: 'log-out',
    });
    if (ok) await leaveApplication();
  },
  'toggle-privacy': () => {
    togglePrivacy();
    renderApplication();
  },
  'toggle-sidebar': (element) => {
    const next = !prefs.sidebarCollapsed;
    savePrefs({ sidebarCollapsed: next });
    const shell = document.querySelector('.app-shell');
    if (shell) shell.classList.toggle('sidebar-collapsed', next);
    element.innerHTML = icon(
      next ? 'chevron-right' : 'chevron-left',
      'w-4 h-4',
    );
    element.setAttribute(
      'aria-label',
      next
        ? 'Tampilkan menu samping'
        : 'Sembunyikan menu samping',
    );
    element.title = next ? 'Tampilkan menu' : 'Sembunyikan menu';
  },
  'toggle-networth-filter': () => {
    const next = ui.networthFilter === 'mine' ? 'all' : 'mine';
    savePrefs({ networthFilter: next });
    ui.networthFilter = next;
    renderApplication();
  },
  'toggle-accounts-filter': () => {
    const next = prefs.accountsFilter === 'mine' ? 'all' : 'mine';
    savePrefs({ accountsFilter: next });
    renderApplication();
  },
  'set-accounts-view': (element) => {
    savePrefs({ accountsView: element.dataset.view === 'list' ? 'list' : 'grid' });
    renderApplication();
  },
  'set-categories-view': (element) => {
    savePrefs({ categoriesView: element.dataset.view === 'list' ? 'list' : 'grid' });
    renderApplication();
  },
  'set-networth-filter': (element) => {
    const next = element.dataset.scope === 'mine' ? 'mine' : 'all';
    savePrefs({ networthFilter: next });
    if (!ui.networthFilter) ui.networthFilter = next;
    ui.networthFilter = next;
    renderApplication();
  },
  'theme-set': (element) => {
    setTheme(element.dataset.theme);
    renderApplication();
  },
  notifications: async () => {
    await requestNotifications();
  },
  'install-help': () => {
    openInstallHelp();
  },
  'check-update': async () => {
    await checkForUpdate();
  },
  'change-pin': () => {
    const user = store.currentUser;
    if (!user) return;
    closeModal({ silent: true });
    openModal({
      size: 'md',
      className: 'form-modal',
      html: changePinForm(user),
    });
  },
  'edit-profile': () => {
    const user = store.currentUser;
    if (!user) return;
    closeModal({ silent: true });
    openModal({
      size: 'md',
      className: 'form-modal',
      html: profileForm(user),
    });
  },
};
