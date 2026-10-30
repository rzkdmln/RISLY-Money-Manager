import { APP, BOTTOM_NAV, DESKTOP_NAV, MORE_NAV, ROUTES } from '../config.js';
import { Cloud } from '../cloud.js';
import { icon } from '../icons.js';
import { avatar, prefs, syncPill } from '../ui.js';
import { escapeAttr, escapeHTML, formatDate, todayISO } from '../utils.js';

function navItem(route, active) {
  const item = ROUTES[route];
  return `<a href="#/${route}" class="nav-item ${active === route ? 'is-active' : ''}" data-nav="${route}" aria-current="${active === route ? 'page' : 'false'}">
    <span class="nav-icon">${icon(item.icon, 'w-[18px] h-[18px]')}</span>
    <span>${escapeHTML(item.label)}</span>
  </a>`;
}

export function shellView(user, dueCount = 0) {
  const active = 'dashboard';
  const status = Cloud.getStatus();
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-mark">R</span>
        <div class="min-w-0">
          <p class="brand-name">${APP.name}</p>
          <p class="brand-caption">Money Manager</p>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="Navigasi utama">
        <p class="nav-section-label">Ruang keluarga</p>
        ${DESKTOP_NAV.slice(0, 4).map((route) => navItem(route, active)).join('')}
        <p class="nav-section-label mt-5">Kelola</p>
        ${DESKTOP_NAV.slice(4).map((route) => navItem(route, active)).join('')}
      </nav>

      <div class="sidebar-bottom">
        <div class="sidebar-sync js-sync-slot">${syncPill(status)}</div>
        <button type="button" class="sidebar-user" data-action="open-profile">
          ${avatar(user, 'md')}
          <span class="min-w-0 text-left">
            <span class="block text-sm font-semibold text-slate-900 dark:text-white truncate">${escapeHTML(user?.name || 'Pengguna')}</span>
            <span class="block text-[11px] text-slate-500 dark:text-slate-400">Ketuk untuk profil & kunci</span>
          </span>
          ${icon('more-horizontal', 'w-4 h-4 text-slate-400 ml-auto')}
        </button>
        <p class="sidebar-version">${APP.name} v${APP.version} · PWA</p>
      </div>
    </aside>

    <div class="app-main">
      <header class="topbar">
        <div class="topbar-left">
          <a href="#/dashboard" class="mobile-brand" aria-label="${APP.name}">
            <span class="brand-mark brand-mark-sm">R</span>
            <span class="brand-name">${APP.name}</span>
          </a>
          <div class="topbar-date hidden lg:block">
            <span>${icon('calendar', 'w-3.5 h-3.5')}</span>
            <span>${escapeHTML(formatDate(todayISO(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</span>
          </div>
        </div>
        <div class="topbar-right">
          <div class="js-sync-slot desktop-sync-slot">${syncPill(status)}</div>
          <button type="button" class="icon-btn topbar-bell" data-action="open-tasks" aria-label="Tugas dan pengingat">
            ${icon('bell', 'w-[18px] h-[18px]')}
            ${dueCount > 0 ? `<span class="notification-dot">${dueCount > 9 ? '9+' : dueCount}</span>` : ''}
          </button>
          <button type="button" class="topbar-avatar" data-action="open-profile" aria-label="Menu profil">
            ${avatar(user, 'sm')}
          </button>
        </div>
      </header>

      <main id="page-content" class="page-content" tabindex="-1"></main>
    </div>

    <button type="button" class="fab" data-action="add-tx" data-type="expense" aria-label="Tambah transaksi">
      ${icon('plus', 'w-6 h-6', 2.2)}
    </button>

    <nav class="bottom-nav" aria-label="Navigasi bawah">
      ${BOTTOM_NAV.map((route) => `<a href="#/${route}" class="bottom-nav-item" data-nav="${route}" aria-current="false">
        ${icon(ROUTES[route].icon, 'w-[21px] h-[21px]')}
        <span>${escapeHTML(ROUTES[route].label)}</span>
      </a>`).join('')}
      <button type="button" class="bottom-nav-item" data-action="open-more" aria-label="Menu lainnya">
        ${icon('menu', 'w-[21px] h-[21px]')}
        <span>Lainnya</span>
      </button>
    </nav>
  </div>`;
}

export function updateChrome(route) {
  document.querySelectorAll('[data-nav]').forEach((node) => {
    const active = node.dataset.nav === route;
    node.classList.toggle('is-active', active);
    node.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const moreButton = document.querySelector('.bottom-nav-item[data-action="open-more"]');
  if (moreButton) moreButton.classList.toggle('is-active', MORE_NAV.includes(route) || route === 'categories');
}

export function updateSyncSlots(status) {
  document.querySelectorAll('.js-sync-slot').forEach((slot) => {
    slot.innerHTML = syncPill(status);
  });
}

export function profileSheet(user) {
  const status = Cloud.getStatus();
  return `<div class="sheet-handle"></div>
    <div class="p-5 sm:p-6">
      <div class="flex items-center gap-4">
        ${avatar(user, 'xl')}
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">Masuk sebagai</p>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">${escapeHTML(user?.name || 'Pengguna')}</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400">${escapeHTML(APP.fullName)}</p>
        </div>
      </div>
      <div class="profile-menu mt-6">
        <a href="#/settings" class="profile-menu-item" data-action="nav" data-route="settings">${icon('settings', 'w-4.5 h-4.5')} Pengaturan akun</a>
        <button type="button" class="profile-menu-item" data-action="change-pin">${icon('lock', 'w-4.5 h-4.5')} Ubah PIN</button>
        <button type="button" class="profile-menu-item" data-action="notifications">${icon('bell', 'w-4.5 h-4.5')} Izin notifikasi</button>
        <button type="button" class="profile-menu-item" data-action="toggle-privacy">${icon('eye-off', 'w-4.5 h-4.5')} ${prefs.hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal'}</button>
      </div>
      <div class="mt-4 rounded-2xl bg-slate-50 dark:bg-white/[.04] px-4 py-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold text-slate-700 dark:text-slate-200">${escapeHTML(status.providerLabel)}</p>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHTML(status.error || status.message || 'Data lokal di perangkat ini')}</p>
        </div>
        ${syncPill(status)}
      </div>
      <div class="grid grid-cols-2 gap-2.5 mt-4">
        <button type="button" class="btn btn-secondary" data-action="lock-app">${icon('lock', 'w-4 h-4')} Kunci</button>
        <button type="button" class="btn btn-danger-soft" data-action="logout">${icon('log-out', 'w-4 h-4')} Keluar</button>
      </div>
    </div>`;
}

export function moreSheet() {
  return `<div class="sheet-handle"></div>
    <div class="p-5 sm:p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">Jelajahi</p>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Menu lainnya</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="more-grid mt-5">
        ${MORE_NAV.map((route) => {
          const item = ROUTES[route];
          return `<a href="#/${route}" class="more-tile" data-action="nav" data-route="${escapeAttr(route)}">
            <span>${icon(item.icon, 'w-5 h-5')}</span>
            <strong>${escapeHTML(item.label)}</strong>
          </a>`;
        }).join('')}
      </div>
    </div>`;
}
