import { APP } from './config.js';
import { icon } from './icons.js';
import {
  clamp,
  escapeAttr,
  escapeHTML,
  formatCurrency,
  getInitials,
  setPrivacyHidden,
} from './utils.js';

const DEFAULT_PREFS = {
  theme: 'system',
  hideAmounts: false,
  notesView: 'grid',
  calendarMode: 'month',
  lastUser: null,
  installDismissed: false,
};

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(APP.prefsKey) || '{}') || {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const prefs = loadPrefs();
setPrivacyHidden(prefs.hideAmounts);

export function savePrefs(patch = {}) {
  Object.assign(prefs, patch);
  localStorage.setItem(APP.prefsKey, JSON.stringify(prefs));
  setPrivacyHidden(prefs.hideAmounts);
}

export const ui = {
  route: 'dashboard',
  params: {},
  appMounted: false,
  currentUser: null,
  selectedUser: null,
  locked: false,
  txMonth: '',
  txType: 'all',
  txAccount: 'all',
  txCategory: 'all',
  txUser: 'all',
  txQuery: '',
  txTab: 'history',
  txLimit: 40,
  calendarMonth: '',
  budgetMonth: '',
  reportMonth: '',
  notesTab: 'all',
  notesQuery: '',
  notesTag: '',
  notesSort: 'updated',
  notesView: prefs.notesView,
  categoryTab: 'expense',
  pendingQuickAdd: null,
};

/* -------------------------------------------------------------------------- */
/*  Theme & money helpers                                                     */
/* -------------------------------------------------------------------------- */

export function resolvedTheme() {
  if (prefs.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return prefs.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#08101E' : '#F5F7FB');
  setPrivacyHidden(prefs.hideAmounts);
}

export function setTheme(theme) {
  savePrefs({ theme });
  applyTheme();
}

export function money(value, options = {}) {
  return formatCurrency(value, { ...options, hide: options.hide ?? prefs.hideAmounts });
}

export function moneySigned(value, options = {}) {
  return money(value, { ...options, sign: true });
}

export function togglePrivacy() {
  savePrefs({ hideAmounts: !prefs.hideAmounts });
  return prefs.hideAmounts;
}

/* -------------------------------------------------------------------------- */
/*  Reusable markup                                                           */
/* -------------------------------------------------------------------------- */

export function avatar(user, size = 'md', extra = '') {
  const sizes = {
    xs: 'w-7 h-7 text-[10px]',
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };
  const name = user?.name || '?';
  const color = user?.color || '#2563EB';
  return `<span class="avatar ${sizes[size] || sizes.md} ${extra}" style="--avatar-color:${escapeAttr(color)}" aria-label="${escapeAttr(name)}">${escapeHTML(getInitials(name))}</span>`;
}

export function badge(text, tone = 'slate', extra = '') {
  const tones = {
    slate: 'badge-slate',
    blue: 'badge-blue',
    green: 'badge-green',
    red: 'badge-red',
    amber: 'badge-amber',
    purple: 'badge-purple',
    pink: 'badge-pink',
    cyan: 'badge-cyan',
  };
  return `<span class="badge ${tones[tone] || tones.slate} ${extra}">${text}</span>`;
}

export function progressBar(percent, tone = 'safe', extra = '') {
  const value = clamp(Number(percent) || 0, 0, 100);
  return `<div class="progress-track ${extra}" role="progressbar" aria-valuenow="${Math.round(Number(percent) || 0)}" aria-valuemin="0" aria-valuemax="100">
    <span class="progress-fill progress-${tone}" style="width:${value}%"></span>
  </div>`;
}

export function toneForPercent(percent, warning = 75, danger = 90) {
  if (Number(percent) >= 100) return 'over';
  if (Number(percent) >= danger) return 'danger';
  if (Number(percent) >= warning) return 'warning';
  return 'safe';
}

export function sectionHeading(title, action = '') {
  return `<div class="flex items-center justify-between gap-3 mb-3">
    <h2 class="section-title">${escapeHTML(title)}</h2>
    ${action}
  </div>`;
}

export function pageHeader({ eyebrow = '', title = '', subtitle = '', actions = '' }) {
  return `<div class="page-heading">
    <div class="min-w-0">
      ${eyebrow ? `<p class="page-eyebrow">${eyebrow}</p>` : ''}
      <h1 class="page-title">${title}</h1>
      ${subtitle ? `<p class="page-subtitle">${subtitle}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

export function emptyState(iconName, title, description, action = '') {
  return `<div class="empty-state">
    <span class="empty-icon">${icon(iconName, 'w-6 h-6')}</span>
    <h3>${escapeHTML(title)}</h3>
    <p>${escapeHTML(description)}</p>
    ${action}
  </div>`;
}

export function spinner(size = 'md') {
  const px = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-8 h-8' }[size] || 'w-5 h-5';
  return `<span class="spinner ${px}" aria-hidden="true"></span>`;
}

export function syncPill(status) {
  const state = status?.state || 'local';
  const map = {
    local: { tone: 'local', label: 'Lokal', icon: 'device' },
    idle: { tone: 'idle', label: 'Cloud', icon: 'cloud' },
    connecting: { tone: 'syncing', label: 'Menghubungkan', icon: 'refresh' },
    syncing: { tone: 'syncing', label: 'Menyinkronkan', icon: 'refresh' },
    synced: { tone: 'synced', label: 'Tersinkron', icon: 'cloud' },
    error: { tone: 'error', label: 'Gagal sync', icon: 'cloud-off' },
    offline: { tone: 'offline', label: 'Offline', icon: 'cloud-off' },
  };
  const item = map[state] || map.local;
  return `<button type="button" class="sync-pill sync-${item.tone}" data-action="sync-now" title="${escapeAttr(status?.error || status?.message || item.label)}">
    <span class="sync-dot"></span>${icon(item.icon, 'w-3.5 h-3.5')}<span>${escapeHTML(item.label)}</span>
  </button>`;
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                     */
/* -------------------------------------------------------------------------- */

let modalOnClose = null;
let lastFocused = null;

const MODAL_SIZES = {
  sm: 'modal-sm',
  md: 'modal-md',
  lg: 'modal-lg',
  xl: 'modal-xl',
  full: 'modal-full',
};

export function openModal({
  html,
  size = 'md',
  className = '',
  onClose = null,
  labelledBy = '',
}) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  if (!root.classList.contains('hidden') && modalOnClose) {
    try { modalOnClose(); } catch { /* noop */ }
  }
  lastFocused = document.activeElement;
  modalOnClose = onClose;
  root.innerHTML = `<div class="modal-backdrop" data-action="close-modal" aria-hidden="true"></div>
    <section class="modal-panel ${MODAL_SIZES[size] || MODAL_SIZES.md} ${className}" role="dialog" aria-modal="true" ${labelledBy ? `aria-labelledby="${escapeAttr(labelledBy)}"` : ''}>
      ${html}
    </section>`;
  root.classList.remove('hidden');
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    const panel = root.querySelector('.modal-panel');
    panel?.classList.add('modal-in');
    const autofocus = panel?.querySelector('[autofocus], input:not([type="hidden"]), textarea, [contenteditable="true"]');
    if (autofocus) {
      setTimeout(() => {
        try { autofocus.focus({ preventScroll: true }); } catch { /* noop */ }
      }, 60);
    }
  });
}

export function closeModal({ silent = false } = {}) {
  const root = document.getElementById('modal-root');
  if (!root || root.classList.contains('hidden')) return;
  const callback = modalOnClose;
  modalOnClose = null;
  root.classList.add('hidden');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (lastFocused && typeof lastFocused.focus === 'function') {
    try { lastFocused.focus({ preventScroll: true }); } catch { /* noop */ }
  }
  lastFocused = null;
  if (!silent && callback) {
    try { callback(); } catch (error) { console.error(error); }
  } else if (silent && callback) {
    try { callback(); } catch { /* noop */ }
  }
}

export function confirmDialog({
  title = 'Konfirmasi',
  message = 'Apakah Anda yakin?',
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  danger = true,
  iconName = 'alert-triangle',
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    closeModal({ silent: true });
    openModal({
      size: 'sm',
      onClose: () => finish(false),
      html: `<div class="p-5 sm:p-6">
        <div class="flex items-start gap-3.5">
          <span class="confirm-icon ${danger ? 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400' : 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400'}">${icon(iconName, 'w-5 h-5')}</span>
          <div class="min-w-0">
            <h2 class="text-[17px] font-bold text-slate-900 dark:text-white">${escapeHTML(title)}</h2>
            <p class="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">${escapeHTML(message)}</p>
          </div>
        </div>
        <div class="mt-6 grid grid-cols-2 gap-2.5">
          <button type="button" class="btn btn-secondary" data-confirm-cancel>${escapeHTML(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${escapeHTML(confirmLabel)}</button>
        </div>
      </div>`,
    });
    document.querySelector('[data-confirm-ok]')?.addEventListener('click', () => {
      // Resolve before closing: closeModal intentionally invokes onClose (false).
      finish(true);
      closeModal({ silent: true });
    });
    document.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => {
      closeModal({ silent: true });
      finish(false);
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Toasts                                                                    */
/* -------------------------------------------------------------------------- */

export function toast(message, type = 'success', action = null) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    document.body.appendChild(root);
  }
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  const iconName = type === 'error' ? 'alert-triangle' : type === 'info' ? 'info' : 'check-circle';
  node.innerHTML = `<span class="toast-icon">${icon(iconName, 'w-4 h-4')}</span><span class="toast-message"></span>`;
  node.querySelector('.toast-message').textContent = String(message || '');
  if (action?.label && typeof action.onClick === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.onClick();
      node.remove();
    });
    node.appendChild(button);
  }
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('toast-in'));
  const timeout = setTimeout(() => {
    node.classList.remove('toast-in');
    setTimeout(() => node.remove(), 250);
  }, action ? 6_500 : 4_000);
  node.addEventListener('click', (event) => {
    if (event.target.closest('.toast-action')) return;
    clearTimeout(timeout);
    node.classList.remove('toast-in');
    setTimeout(() => node.remove(), 250);
  });
}

/* -------------------------------------------------------------------------- */
/*  Global keyboard / theme listeners                                         */
/* -------------------------------------------------------------------------- */

document.addEventListener('keydown', (event) => {
  const root = document.getElementById('modal-root');
  const isOpen = root && !root.classList.contains('hidden');
  if (!isOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...root.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
  )].filter((el) => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (prefs.theme === 'system') applyTheme();
});

applyTheme();
